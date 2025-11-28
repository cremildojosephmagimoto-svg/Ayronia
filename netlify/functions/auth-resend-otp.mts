import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { Resend } from "resend";

interface ResendOTPData {
  email: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  verified: boolean;
  createdAt: string;
}

interface OTPData {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(
  email: string,
  name: string,
  otp: string
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Netlify.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured, OTP:", otp);
    return { success: false, error: "Email service not configured. Please set RESEND_API_KEY environment variable." };
  }

  try {
    const resend = new Resend(resendApiKey);
    const emailFrom = Netlify.env.get("EMAIL_FROM") || "Ayronia <onboarding@resend.dev>";

    const emailBody = `
Olá ${name},

O seu novo código de verificação para a Ayronia é:

${otp}

Este código é válido por 10 minutos.

Se não solicitou este código, por favor ignore este email.

Obrigado,
Equipa Ayronia
`;

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [email],
      subject: `Novo Código de Verificação Ayronia - ${otp}`,
      text: emailBody,
    });

    if (error) {
      console.error("Resend email error:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log("Email sent successfully:", data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data: ResendOTPData = await req.json();

    if (!data.email) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const usersStore = getStore("users");
    const otpStore = getStore("otp-codes");

    const normalizedEmail = data.email.toLowerCase().trim();
    const user: User | null = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Utilizador não encontrado. Por favor, registe-se primeiro.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (user.verified) {
      return new Response(
        JSON.stringify({
          error: "Este email já foi verificado. Por favor, faça login.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const otp = generateOTP();
    const otpData: OTPData = {
      code: otp,
      email: normalizedEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };

    await otpStore.setJSON(`otp:${normalizedEmail}`, otpData);

    const emailResult = await sendOTPEmail(normalizedEmail, user.name, otp);

    if (!emailResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Não foi possível enviar o código de verificação. Por favor, tente novamente mais tarde.",
          emailError: emailResult.error,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Novo código de verificação enviado para o seu email.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error resending OTP:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao reenviar o código",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/auth/resend-otp",
};
