import type { Context } from "@netlify/functions";

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

    const emailApiKey = Netlify.env.get("EMAIL_API_KEY");
    const emailApiUrl = Netlify.env.get("EMAIL_API_URL");

    let emailSent = false;
    let emailError = null;

    if (emailApiKey && emailApiUrl) {
      try {
        const emailResponse = await fetch(emailApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${emailApiKey}`,
          },
          body: JSON.stringify({
            to: "aroniacs@gmail.com",
            from: Netlify.env.get("EMAIL_FROM") || "noreply@ayronia.netlify.app",
            subject: `Nova Encomenda - ${orderData.orderNumber}`,
            text: emailBody,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
        } else {
          emailError = `Email API responded with status ${emailResponse.status}`;
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Unknown error";
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: orderData.orderNumber,
        whatsappUrl: `https://wa.me/258${orderData.customerPhone.replace(/\D/g, "").slice(-9)}?text=${whatsappMessage}`,
        whatsappAdminUrl: `https://wa.me/258842612828?text=${whatsappMessage}`,
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
