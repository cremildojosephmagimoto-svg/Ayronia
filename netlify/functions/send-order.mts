import type { Context } from "@netlify/functions";
import { Resend } from "resend";

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

Método de Pagamento: ${orderData.paymentMethod === "mpesa" ? "M-Pesa" : "Cartão"}
`;

    const whatsappMessage = encodeURIComponent(
      `🛒 *NOVO PEDIDO - ${orderData.orderNumber}*\n\n` +
        `👤 *Cliente:* ${orderData.customerName}\n` +
        `📧 *Email:* ${orderData.customerEmail}\n` +
        `📱 *Telefone:* ${orderData.customerPhone}\n` +
        `📍 *Morada:* ${orderData.address}, ${orderData.city}\n\n` +
        `🛍️ *Itens:*\n${itemsList}\n\n` +
        `💰 *Total:* ${orderData.total} MT\n` +
        `💳 *Pagamento:* ${orderData.paymentMethod === "mpesa" ? "M-Pesa" : "Cartão"}`
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
