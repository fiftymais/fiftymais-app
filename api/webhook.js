const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function gerarSenha() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 10; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { type, data } = event;
  console.log('Evento:', type);

  if (type === 'checkout.session.completed') {
    const session = data.object;
    const email = session.customer_details?.email || session.customer_email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const nome = session.customer_details?.name || '';

    if (!email) return res.status(400).send('Email não encontrado');

    try {
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === email);

      let userId;
      let senha;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        senha = gerarSenha();
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome }
        });
        if (createError) {
          console.error('Erro ao criar usuário:', createError);
          return res.status(500).send('Erro ao criar usuário');
        }
        userId = newUser.user.id;
      }

      await supabase.from('profiles').upsert({
        id: userId,
        is_active: true,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        updated_at: new Date().toISOString()
      });

      if (senha) await enviarEmailBoasVindas(email, senha, nome);

    } catch (err) {
      console.error('Erro interno:', err);
      return res.status(500).send('Erro interno');
    }
  }

  if (type === 'customer.subscription.deleted' || type === 'invoice.payment_failed') {
    await supabase.from('profiles').update({
      is_active: false,
      subscription_status: 'inactive'
    }).eq('stripe_customer_id', data.object.customer);
  }

  res.json({ received: true });
};

async function enviarEmailBoasVindas(email, senha, nome) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY não configurada');
    return;
  }

  const nomeFormatado = nome ? nome.split(' ')[0] : 'Marceneiro';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.header{background:#D42B2B;padding:40px;text-align:center}
.header h1{color:white;margin:0;font-size:32px;letter-spacing:-1px}
.header p{color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px}
.body{padding:40px}
.greeting{font-size:18px;font-weight:bold;color:#111;margin-bottom:16px}
.text{color:#555;line-height:1.6;margin-bottom:24px}
.credentials{background:#f8f8f8;border:2px solid #eee;border-radius:12px;padding:24px;margin:24px 0}
.cred-label{font-size:12px;font-weight:bold;color:#999;text-transform:uppercase;display:block;margin-bottom:4px}
.cred-value{font-size:18px;font-weight:bold;color:#111;font-family:monospace;display:block;margin-bottom:16px;word-break:break-all}
.cred-value:last-child{margin-bottom:0}
.btn{display:block;background:#D42B2B;color:white;text-decoration:none;text-align:center;padding:16px 32px;border-radius:12px;font-weight:bold;font-size:16px;margin:24px 0}
.footer{padding:24px 40px;border-top:1px solid #eee;text-align:center}
.footer p{color:#999;font-size:12px;margin:0}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Fifty+</h1>
    <p>Propostas profissionais para marceneiros</p>
  </div>
  <div class="body">
    <div class="greeting">Bem-vindo ao Fifty+, ${nomeFormatado}! 🎉</div>
    <p class="text">Seu pagamento foi confirmado! Seu acesso está <strong>ativo agora mesmo</strong>. Aqui estão suas credenciais de acesso:</p>
    <div class="credentials">
      <span class="cred-label">E-mail</span>
      <span class="cred-value">${email}</span>
      <span class="cred-label">Senha</span>
      <span class="cred-value">${senha}</span>
    </div>
    <a href="https://www.fiftymais.site" class="btn">ACESSAR O FIFTY+ AGORA →</a>
    <p class="text" style="font-size:13px;color:#999">Guarde estas informações em local seguro. Você pode alterar a senha dentro do app a qualquer momento.</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Fifty+ • Suporte: contato@fiftymais.com.br</p>
  </div>
</div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Fifty+ <noreply@fiftymais.com.br>',
        to: email,
        subject: '🎉 Seu acesso ao Fifty+ está pronto!',
        html
      })
    });

    if (response.ok) {
      console.log('Email enviado para:', email);
    } else {
      const err = await response.text();
      console.error('Erro Resend:', err);
    }
  } catch (err) {
    console.error('Erro ao enviar email:', err);
  }
}
