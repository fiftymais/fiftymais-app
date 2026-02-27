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

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { type, data } = event;

  if (type === 'checkout.session.completed') {
    const userId = data.object.metadata.userId;
    await supabase.from('profiles').update({
      is_active: true,
      stripe_customer_id: data.object.customer,
      stripe_subscription_id: data.object.subscription,
      subscription_status: 'active'
    }).eq('id', userId);
  }

  if (type === 'customer.subscription.deleted' || type === 'invoice.payment_failed') {
    await supabase.from('profiles').update({
      is_active: false,
      subscription_status: 'inactive'
    }).eq('stripe_customer_id', data.object.customer);
  }

  res.json({ received: true });
};
