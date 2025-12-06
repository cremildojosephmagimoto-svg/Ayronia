import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { Resend } from "resend";
import type { User, UserRole, OTPData } from "./shared/types.mts";

// Initial admin emails - these users will automatically receive admin role upon registration
const INITIAL_ADMIN_EMAILS: string[] = [
  "cremildojosephmagimoto@gmail.com",
];

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
  role?: UserRole;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

O seu código de verificação para criar a sua conta na Ayronia é:

${otp}

Este código é válido por 10 minutos.

Se não solicitou este código, por favor ignore este email.

Obrigado,
Equipa Ayronia
`;

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [email],
      subject: `Código de Verificação Ayronia - ${otp}`,
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
    const data: RegisterData = await req.json();

    if (!data.name || !data.email || !data.phone || !data.password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (data.password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const usersStore = getStore("users");
    const otpStore = getStore("otp-codes");

    const normalizedEmail = data.email.toLowerCase().trim();
    const existingUser = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (existingUser && existingUser.verified) {
      return new Response(
        JSON.stringify({ error: "Este email já está registado" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password);

    // Check if email is in initial admin list, otherwise default to 'cliente'
    const isInitialAdmin = INITIAL_ADMIN_EMAILS.some(
      adminEmail => adminEmail.toLowerCase().trim() === normalizedEmail
    );
    const userRole: UserRole = isInitialAdmin ? 'administrador' : 'cliente';

    const user: User = {
      id: userId,
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone.trim(),
      passwordHash,
      verified: false,
      role: userRole,
      createdAt: new Date().toISOString(),
    };

    await usersStore.setJSON(`user:${normalizedEmail}`, user);

    const otp = generateOTP();
    const otpData: OTPData = {
      code: otp,
      email: normalizedEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };

    await otpStore.setJSON(`otp:${normalizedEmail}`, otpData);

    const emailResult = await sendOTPEmail(normalizedEmail, data.name, otp);

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
        message:
          "Código de verificação enviado para o seu email. Por favor, verifique a sua caixa de entrada.",
        email: normalizedEmail,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during registration:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar o registo",
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
  path: "/api/auth/register",
};
