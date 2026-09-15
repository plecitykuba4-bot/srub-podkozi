// Odesílání e-mailů přes SMTP schránky restaurace (Webglobe).
// Konfigurace je v .env; bez ní se nic neodesílá a appka to jen zapíše do stavu reportu.
import nodemailer from 'nodemailer';

export function smtpConfig(env = process.env) {
  const {SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM} = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) return null;
  const port = Number(SMTP_PORT || 465);
  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {user: SMTP_USER, pass: SMTP_PASS},
    from: MAIL_FROM,
    // Antivirus na některých počítačích rozplétá TLS a podepisuje spojení vlastním
    // certifikátem. Na serveru to nenastává, proto je výjimka vypnutá a jen volitelná.
    allowUnverifiedTls: env.SMTP_ALLOW_UNVERIFIED_TLS === 'true'
  };
}

export async function sendMail(config, {to, subject, text, html, attachments}) {
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure, auth: config.auth,
    tls: config.allowUnverifiedTls ? {rejectUnauthorized: false} : undefined
  });
  try {
    return await transport.sendMail({from: config.from, to, subject, text, html, attachments});
  } catch (e) {
    if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN/.test(String(e.message || e.code))) {
      throw new Error('Nepodařilo se ověřit certifikát SMTP serveru. Na tomto počítači to obvykle způsobuje antivirus, který poštovní spojení rozplétá. Spusťte server s NODE_OPTIONS=--use-openssl-ca, nebo dočasně nastavte SMTP_ALLOW_UNVERIFIED_TLS=true.');
    }
    throw e;
  } finally {
    transport.close();
  }
}
