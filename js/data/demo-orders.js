// Pedidos fictícios para o painel não abrir vazio. Todos marcados como demonstração.

const NAMES = [
  "Mariana Okuda", "Letícia Brandão", "Camila Venturini", "Juliana Prates", "Bruna Takahashi",
  "Patrícia Moreira", "Aline Cardoso", "Renata Fujimoto", "Gabriela Ruiz", "Fernanda Lacerda",
  "Daniela Ogawa", "Isabela Furtado", "Vanessa Kobayashi", "Larissa Mendonça", "Tatiane Albuquerque",
];

// PRNG com semente fixa: a demo sempre nasce igual
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const PAY = ["pix", "pix", "cartao", "pix", "boleto"];

export function buildDemoOrders(products) {
  const rand = rng(20261103);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const orders = [];
  const year = new Date().getFullYear();
  const total = 22;
  for (let i = 0; i < total; i += 1) {
    const daysAgo = Math.floor((1 - i / total) * 14);
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);
    const itemCount = 1 + Math.floor(rand() * 2);
    const items = [];
    for (let k = 0; k < itemCount; k += 1) {
      const p = pick(products);
      const selections = {};
      for (const o of p.options) {
        if (o.type === "select") selections[o.id] = o.choices[0].label;
        if (o.type === "text" && o.required) selections[o.id] = pick(["Helena", "Maria Clara", "Theo", "Alice", "Lorena", "Benício"]);
      }
      items.push({ productId: p.id, name: p.name, image: p.image, mode: p.mode, qty: 1 + Math.floor(rand() * 2), unit: p.price, selections, photo: null });
    }
    const subtotal = items.reduce((s, it) => s + it.unit * it.qty, 0);
    const method = rand() > 0.45 ? "envio" : "retirada";
    const shipping = method === "envio" && subtotal < 19900 ? 1890 : 0;
    const age = daysAgo;
    let status = "concluido";
    if (age <= 1) status = pick(["aguardando", "pago", "pago"]);
    else if (age <= 4) status = pick(["pago", "producao", "producao", "pronto"]);
    else if (age <= 7) status = pick(["producao", "pronto", "enviado"]);
    else if (rand() < 0.08) status = "cancelado";
    const payMethod = pick(PAY);
    const name = NAMES[i % NAMES.length];
    const iso = created.toISOString();
    orders.push({
      id: `TP-${year}-${String(i + 1).padStart(4, "0")}`,
      createdAt: iso,
      demo: true,
      customer: {
        name,
        email: `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@exemplo.com.br`,
        phone: `(43) 9${8100 + Math.floor(rand() * 899)}-${1000 + Math.floor(rand() * 8999)}`,
      },
      shipping: method === "envio"
        ? { method, cep: "86000-000", street: "Rua de exemplo", number: String(10 + Math.floor(rand() * 900)), district: "Centro", city: "Cidade exemplo", uf: "PR" }
        : { method },
      payment: { method: payMethod, status: status === "aguardando" ? "pendente" : "aprovado" },
      coupon: null,
      items,
      totals: { subtotal, discount: 0, shipping, total: subtotal + shipping },
      leadDays: 5,
      status,
      history: [{ at: iso, status, note: "Pedido de demonstração." }],
    });
  }
  return orders;
}
