import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { Resend } from "resend";

interface RequestResetData {
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

interface PasswordResetData {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendPasswordResetEmail(
  email: string,
  name: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Netlify.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured, Reset Code:", code);
    return { success: false, error: "Email service not configured. Please set RESEND_API_KEY environment variable." };
  }

  try {
    const resend = new Resend(resendApiKey);
    const emailFrom = Netlify.env.get("EMAIL_FROM") || "Ayronia <onboarding@resend.dev>";

    const emailBody = `
Olá ${name},

Recebemos um pedido para redefinir a senha da sua conta na Ayronia.

O seu código de recuperação é:

${code}

Este código é válido por 30 minutos.

Se não solicitou a redefinição da senha, por favor ignore este email. A sua senha permanecerá inalterada.

Obrigado,
Equipa Ayronia
`;

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [email],
      subject: `Recuperação de Senha Ayronia - ${code}`,
      text: emailBody,
    });

    if (error) {
      console.error("Resend email error:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log("Password reset email sent successfully:", data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending password reset email:", error);
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
    const data: RequestResetData = await req.json();

    if (!data.email) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const usersStore = getStore("users");
    const resetStore = getStore("password-reset-codes");

    const normalizedEmail = data.email.toLowerCase().trim();
    const user: User | null = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    // For security, always return success message even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se este email estiver registado, receberá um código de recuperação.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is verified - unverified users should complete registration first
    if (!user.verified) {
      return new Response(
        JSON.stringify({
          error: "Esta conta ainda não foi verificada. Por favor, complete o registo primeiro.",
          needsVerification: true,
          email: normalizedEmail,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate reset code
    const resetCode = generateResetCode();
    const resetData: PasswordResetData = {
      code: resetCode,
      email: normalizedEmail,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
      attempts: 0,
    };

    await resetStore.setJSON(`reset:${normalizedEmail}`, resetData);

    const emailResult = await sendPasswordResetEmail(normalizedEmail, user.name, resetCode);

    if (!emailResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Não foi possível enviar o código de recuperação. Por favor, tente novamente mais tarde.",
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
        message: "Se este email estiver registado, receberá um código de recuperação.",
        email: normalizedEmail,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error requesting password reset:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar o pedido",
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
  path: "/api/auth/request-password-reset",
};
