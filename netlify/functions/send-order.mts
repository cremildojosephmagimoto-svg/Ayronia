import type { Context } from "@netlify/functions";
import { Resend } from "resend";
import { getStore } from "@netlify/blobs";

// Order status types
export type OrderStatus = 'pendente' | 'em_preparacao' | 'em_entrega' | 'entregue' | 'pago' | 'cancelado';
export type PaymentStatus = 'aguardando_pagamento' | 'pago' | 'confirmado';

export interface Order {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  city: string;
  postalCode: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  paymentConfirmedByCustomer?: boolean;
}

interface OrderData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  city: string;
  postalCode: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const orderData: OrderData = await req.json();

    // Create order object to store
    const order: Order = {
      ...orderData,
      paymentStatus: 'aguardando_pagamento',
      orderStatus: 'pendente',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentConfirmedByCustomer: false,
    };

    // Save order to Netlify Blobs
    const ordersStore = getStore("orders");
    await ordersStore.setJSON(`order:${orderData.orderNumber}`, order);

    // Also save to customer's orders list
    const customerEmail = orderData.customerEmail.toLowerCase().trim();
    const customerOrdersKey = `customer-orders:${customerEmail}`;
    let customerOrders: string[] = [];

    try {
      const existingOrders = await ordersStore.get(customerOrdersKey);
      if (existingOrders) {
        customerOrders = JSON.parse(existingOrders);
      }
    } catch {
      customerOrders = [];
    }

    customerOrders.unshift(orderData.orderNumber);
    await ordersStore.set(customerOrdersKey, JSON.stringify(customerOrders));

    const itemsList = orderData.items
      .map(
        (item) =>
          `${item.name} x${item.quantity} - ${item.price * item.quantity} MT`
      )
      .join("\n");

    const emailBody = `
Nova Encomenda Recebida - ${orderData.orderNumber}

DADOS DO CLIENTE:
Nome: ${orderData.customerName}
Email: ${orderData.customerEmail}
Telefone: ${orderData.customerPhone}
Morada: ${orderData.address}
Cidade: ${orderData.city}
Código Postal: ${orderData.postalCode}

ITENS DO PEDIDO:
${itemsList}

RESUMO:
Subtotal: ${orderData.subtotal} MT
Taxa de Entrega: ${orderData.deliveryFee} MT
Total: ${orderData.total} MT

Método de Pagamento: Pagamento na Entrega
Estado do Pagamento: Aguardando pagamento na recepção

NOTA: O cliente irá pagar na recepção do produto e confirmar o pagamento na plataforma.
`;

    const whatsappMessage = encodeURIComponent(
      `🛒 *NOVO PEDIDO - ${orderData.orderNumber}*\n\n` +
        `👤 *Cliente:* ${orderData.customerName}\n` +
        `📧 *Email:* ${orderData.customerEmail}\n` +
        `📱 *Telefone:* ${orderData.customerPhone}\n` +
        `📍 *Morada:* ${orderData.address}, ${orderData.city}\n\n` +
        `🛍️ *Itens:*\n${itemsList}\n\n` +
        `💰 *Total:* ${orderData.total} MT\n` +
        `💳 *Pagamento:* Na Entrega\n` +
        `📌 *Estado:* Aguardando pagamento na recepção`
    );

    const resendApiKey = Netlify.env.get("RESEND_API_KEY");

    let emailSent = false;
    let emailError = null;

    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const emailFrom = Netlify.env.get("EMAIL_FROM") || "Ayronia <onboarding@resend.dev>";
        const adminEmail = Netlify.env.get("ADMIN_EMAIL") || "aroniacs@gmail.com";

        const { data, error } = await resend.emails.send({
          from: emailFrom,
          to: [adminEmail],
          subject: `Nova Encomenda - ${orderData.orderNumber}`,
          text: emailBody,
        });

        if (error) {
          console.error("Resend email error:", error);
          emailError = error.message;
        } else {
          console.log("Order email sent successfully:", data?.id);
          emailSent = true;
        }
      } catch (error) {
        console.error("Error sending order email:", error);
        emailError = error instanceof Error ? error.message : "Unknown error";
      }
    } else {
      console.log("RESEND_API_KEY not configured, order email not sent");
      emailError = "Email service not configured";
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: orderData.orderNumber,
        whatsappUrl: `https://wa.me/258${orderData.customerPhone.replace(/\D/g, "").slice(-9)}?text=${whatsappMessage}`,
        whatsappAdminUrl: `https://wa.me/258849220000?text=${whatsappMessage}`,
        emailSent,
        emailError,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing order:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process order",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config = {
  path: "/api/send-order",
};
