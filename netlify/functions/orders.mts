import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { Order, OrderStatus, PaymentStatus } from "./shared/types.mts";

// Helper to get session from Authorization header
async function getSessionFromHeader(req: Request): Promise<{ userId: string; email: string; role: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const sessionsStore = getStore("sessions");

  try {
    const sessionData = await sessionsStore.get(`session:${token}`);
    if (!sessionData) {
      return null;
    }

    const session = JSON.parse(sessionData);
    if (session.expiresAt < Date.now()) {
      return null;
    }

    return {
      userId: session.userId,
      email: session.email,
      role: session.role,
    };
  } catch {
    return null;
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.replace("/api/orders", "").split("/").filter(Boolean);

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Check authentication
  const session = await getSessionFromHeader(req);
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders }
    );
  }

  const ordersStore = getStore("orders");

  // GET /api/orders - List customer's orders
  if (req.method === "GET" && pathParts.length === 0) {
    try {
      const customerEmail = session.email.toLowerCase().trim();
      const customerOrdersKey = `customer-orders:${customerEmail}`;

      let orderNumbers: string[] = [];
      try {
        const ordersList = await ordersStore.get(customerOrdersKey);
        if (ordersList) {
          orderNumbers = JSON.parse(ordersList);
        }
      } catch {
        orderNumbers = [];
      }

      // Fetch all orders for this customer
      const orders: Order[] = [];
      for (const orderNumber of orderNumbers) {
        try {
          const orderData = await ordersStore.get(`order:${orderNumber}`);
          if (orderData) {
            orders.push(JSON.parse(orderData));
          }
        } catch {
          // Skip invalid orders
        }
      }

      return new Response(
        JSON.stringify({ success: true, orders }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Error fetching orders:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch orders" }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // GET /api/orders/:orderNumber - Get single order
  if (req.method === "GET" && pathParts.length === 1) {
    const orderNumber = pathParts[0];

    try {
      const orderData = await ordersStore.get(`order:${orderNumber}`);
      if (!orderData) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: corsHeaders }
        );
      }

      const order: Order = JSON.parse(orderData);

      // Check if user owns this order or is admin/supervisor
      const isOwner = order.customerEmail.toLowerCase() === session.email.toLowerCase();
      const isAdmin = session.role === "administrador" || session.role === "supervisor";

      if (!isOwner && !isAdmin) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 403, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, order }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Error fetching order:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch order" }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // POST /api/orders/:orderNumber/confirm-payment - Customer confirms payment
  if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "confirm-payment") {
    const orderNumber = pathParts[0];

    try {
      const orderData = await ordersStore.get(`order:${orderNumber}`);
      if (!orderData) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: corsHeaders }
        );
      }

      const order: Order = JSON.parse(orderData);

      // Check if user owns this order
      const isOwner = order.customerEmail.toLowerCase() === session.email.toLowerCase();
      if (!isOwner) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 403, headers: corsHeaders }
        );
      }

      // Update order payment status
      order.paymentConfirmedByCustomer = true;
      order.paymentStatus = "pago";
      order.paidAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();

      await ordersStore.setJSON(`order:${orderNumber}`, order);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Pagamento confirmado com sucesso",
          order
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Error confirming payment:", error);
      return new Response(
        JSON.stringify({ error: "Failed to confirm payment" }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // PUT /api/orders/:orderNumber - Update order status (admin/supervisor only)
  if (req.method === "PUT" && pathParts.length === 1) {
    const orderNumber = pathParts[0];

    // Check if admin or supervisor
    if (session.role !== "administrador" && session.role !== "supervisor") {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: corsHeaders }
      );
    }

    try {
      const orderData = await ordersStore.get(`order:${orderNumber}`);
      if (!orderData) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: corsHeaders }
        );
      }

      const order: Order = JSON.parse(orderData);
      const updates = await req.json();

      // Update allowed fields
      if (updates.orderStatus) {
        order.orderStatus = updates.orderStatus as OrderStatus;
      }
      if (updates.paymentStatus) {
        order.paymentStatus = updates.paymentStatus as PaymentStatus;
        if (updates.paymentStatus === "confirmado" || updates.paymentStatus === "pago") {
          order.paidAt = new Date().toISOString();
        }
      }

      order.updatedAt = new Date().toISOString();

      await ordersStore.setJSON(`order:${orderNumber}`, order);

      return new Response(
        JSON.stringify({ success: true, order }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Error updating order:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update order" }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: corsHeaders }
  );
};

export const config = {
  path: "/api/orders/*",
};
