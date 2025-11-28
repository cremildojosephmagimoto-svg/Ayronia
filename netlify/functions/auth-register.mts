import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
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
  const emailApiKey = Netlify.env.get("EMAIL_API_KEY");
  const emailApiUrl = Netlify.env.get("EMAIL_API_URL");

  if (!emailApiKey || !emailApiUrl) {
    console.log("Email API not configured, OTP:", otp);
    return { success: true };
  }

  try {
    const emailBody = `
Olá ${name},

O seu código de verificação para criar a sua conta na Ayronia é:

${otp}

Este código é válido por 10 minutos.

Se não solicitou este código, por favor ignore este email.

Obrigado,
Equipa Ayronia
`;

    const response = await fetch(emailApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        to: email,
        from: Netlify.env.get("EMAIL_FROM") || "noreply@ayronia.netlify.app",
        subject: `Código de Verificação Ayronia - ${otp}`,
        text: emailBody,
      }),
    });

    if (response.ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: `Email API responded with status ${response.status}`,
      };
    }
  } catch (error) {
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

    const user: User = {
      id: userId,
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone.trim(),
      passwordHash,
      verified: false,
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

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Código de verificação enviado para o seu email. Por favor, verifique a sua caixa de entrada.",
        email: normalizedEmail,
        emailSent: emailResult.success,
        emailError: emailResult.error,
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
