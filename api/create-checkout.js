const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: 'https://www.fiftymais.site?sucesso=1',
      cancel_url: 'https://fiftymais.com.br',
      billing_address_collection: 'auto',
      locale: 'pt-BR',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erro checkout:', err);
    res.status(500).json({ error: err.message });
  }
};
