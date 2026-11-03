// Dados iniciais da demonstração. Preços são ilustrativos (valores em centavos).

export const LINES = [
  { slug: "cadernos", name: "Cadernos personalizados", short: "Capa com seu nome, tema e miolo do seu jeito.", image: "/img/p-caderno.webp" },
  { slug: "blocos", name: "Blocos de anotações", short: "Para a mesa, a bolsa ou de lembrancinha.", image: "/img/p-bloco.webp" },
  { slug: "lapis", name: "Personalização de lápis", short: "Lápis com nome para a volta às aulas.", image: "/img/p-lapis.webp" },
  { slug: "polaroide", name: "Fotos polaroide", short: "Suas fotos impressas com borda branca.", image: "/img/p-polaroide.webp" },
  { slug: "quadros", name: "Quadros em MDF", short: "Com foto ou imagem, pronto para presentear.", image: "/img/p-quadro.webp" },
  { slug: "adesivos", name: "Adesivos personalizados", short: "Cartelas recortadas com o tema que você quiser.", image: "/img/p-adesivos.webp" },
  { slug: "etiquetas", name: "Etiquetas escolares", short: "Nome em tudo, do caderno à lancheira.", image: "/img/p-etiquetas.webp" },
  { slug: "imas", name: "Ímãs de geladeira", short: "Foto ou desenho virando lembrança na porta.", image: "/img/p-imas.webp" },
];

const THEMES = [
  { label: "Floral rosa", delta: 0 },
  { label: "Aquarela sálvia", delta: 0 },
  { label: "Margaridas", delta: 0 },
];

const opt = {
  name: (label = "Nome para personalizar", max = 24, required = true) => ({ id: "nome", type: "text", label, maxLength: max, required }),
  theme: () => ({ id: "tema", type: "select", label: "Tema", required: true, choices: THEMES }),
  photo: (required = true) => ({ id: "foto", type: "photo", label: "Sua foto", required }),
  note: () => ({ id: "obs", type: "textarea", label: "Observações para a arte", maxLength: 240, required: false }),
  select: (id, label, choices) => ({ id, type: "select", label, required: true, choices }),
};

export const PRODUCTS = [
  {
    id: "p01", slug: "caderno-floral-personalizado", name: "Caderno floral personalizado", line: "cadernos", mode: "demanda",
    price: 6990, stock: null, leadDays: 7, featured: true, active: true, image: "/img/p-caderno.webp",
    description: "Caderno espiral com capa floral em aquarela, seu nome na frente e acabamento com wire-o dourado.",
    options: [
      opt.name("Nome na capa", 22),
      opt.select("tamanho", "Tamanho", [{ label: "A5 (15 x 21 cm)", delta: 0 }, { label: "A4 (21 x 29,7 cm)", delta: 2500 }]),
      opt.select("miolo", "Miolo", [{ label: "Pautado", delta: 0 }, { label: "Pontilhado", delta: 0 }, { label: "Liso", delta: 0 }]),
      opt.theme(), opt.note(),
    ],
  },
  {
    id: "p02", slug: "caderno-floral-a5", name: "Caderno floral A5", line: "cadernos", mode: "pronta",
    price: 5490, stock: 8, leadDays: 0, featured: false, active: true, image: "/img/p-caderno.webp",
    description: "O mesmo caderno floral, sem nome na capa. Pronto para sair hoje.", options: [],
  },
  {
    id: "p03", slug: "bloco-de-anotacoes-personalizado", name: "Bloco de anotações personalizado", line: "blocos", mode: "demanda",
    price: 2490, stock: null, leadDays: 5, featured: true, active: true, image: "/img/p-bloco.webp",
    description: "Bloco com 50 folhas pautadas, espiral no topo e o seu nome no cabeçalho de cada página.",
    options: [opt.name("Nome no cabeçalho", 20), opt.theme(), opt.note()],
  },
  {
    id: "p04", slug: "kit-bloco-e-caneta", name: "Kit bloco e caneta", line: "blocos", mode: "pronta",
    price: 3290, stock: 12, leadDays: 0, featured: false, active: true, image: "/img/p-bloco.webp",
    description: "Bloco rosa com coração e caneta na mesma cor. Ótimo para lembrancinha.", options: [],
  },
  {
    id: "p05", slug: "lapis-personalizados-com-nome", name: "Lápis personalizados com nome", line: "lapis", mode: "demanda",
    price: 2990, stock: null, leadDays: 5, featured: true, active: true, image: "/img/p-lapis.webp",
    description: "Lápis em tons pastel com o nome gravado e coraçãozinho na ponta.",
    options: [
      opt.name("Nome nos lápis", 18),
      opt.select("kit", "Quantidade", [{ label: "Kit com 6", delta: 0 }, { label: "Kit com 12", delta: 2200 }]),
      opt.select("cores", "Cores", [{ label: "Pastel sortidas", delta: 0 }, { label: "Só rosa", delta: 0 }, { label: "Só verde menta", delta: 0 }]),
    ],
  },
  {
    id: "p06", slug: "kit-lapis-pastel-coracao", name: "Kit lápis pastel coração", line: "lapis", mode: "pronta",
    price: 1990, stock: 20, leadDays: 0, featured: false, active: true, image: "/img/p-lapis.webp",
    description: "Quatro lápis pastel com ponteira dourada e coração pintado.", options: [],
  },
  {
    id: "p07", slug: "fotos-polaroide", name: "Fotos polaroide", line: "polaroide", mode: "demanda",
    price: 2990, stock: null, leadDays: 3, featured: true, active: true, image: "/img/p-polaroide.webp",
    description: "Suas fotos impressas em papel fotográfico com a borda branca clássica. Envie uma aqui e as demais pelo WhatsApp.",
    options: [
      opt.select("kit", "Quantidade", [{ label: "10 fotos", delta: 0 }, { label: "20 fotos", delta: 2400 }, { label: "30 fotos", delta: 4500 }]),
      opt.photo(false),
      { id: "legenda", type: "text", label: "Legenda na borda (opcional)", maxLength: 28, required: false },
    ],
  },
  {
    id: "p08", slug: "varal-de-polaroides", name: "Varal de polaroides", line: "polaroide", mode: "demanda",
    price: 4990, stock: null, leadDays: 4, featured: false, active: true, image: "/img/p-polaroide.webp",
    description: "15 fotos polaroide, cordão de juta e mini pregadores de madeira, em caixa para presente.",
    options: [opt.photo(false), opt.note()],
  },
  {
    id: "p09", slug: "quadro-mdf-com-foto", name: "Quadro em MDF com foto", line: "quadros", mode: "demanda",
    price: 4490, stock: null, leadDays: 6, featured: true, active: true, image: "/img/p-quadro.webp",
    description: "Bloco de MDF com a sua foto impressa e base para ficar em pé na estante.",
    options: [
      opt.select("tamanho", "Tamanho", [{ label: "15 x 15 cm", delta: 0 }, { label: "20 x 20 cm", delta: 1500 }, { label: "30 x 30 cm", delta: 3500 }]),
      opt.photo(true),
      { id: "texto", type: "text", label: "Frase ou nome (opcional)", maxLength: 30, required: false },
    ],
  },
  {
    id: "p10", slug: "quadro-mdf-pet", name: "Quadro MDF do seu pet", line: "quadros", mode: "demanda",
    price: 4990, stock: null, leadDays: 6, featured: false, active: true, image: "/img/p-quadro.webp",
    description: "A foto do seu bichinho com coraçõezinhos desenhados nos cantos e o nome dele.",
    options: [opt.photo(true), opt.name("Nome do pet", 16)],
  },
  {
    id: "p11", slug: "adesivos-personalizados", name: "Adesivos personalizados", line: "adesivos", mode: "demanda",
    price: 1890, stock: null, leadDays: 4, featured: true, active: true, image: "/img/p-adesivos.webp",
    description: "Cartela de adesivos em vinil brilhante, recortados no formato de cada desenho.",
    options: [
      opt.select("cartela", "Quantidade", [{ label: "20 adesivos", delta: 0 }, { label: "40 adesivos", delta: 1400 }]),
      { id: "tema-livre", type: "text", label: "Tema (ex.: festa jardim, ursinhos)", maxLength: 40, required: true },
      opt.name("Nome (opcional)", 18, false),
    ],
  },
  {
    id: "p12", slug: "cartela-adesivos-floral", name: "Cartela de adesivos floral", line: "adesivos", mode: "pronta",
    price: 1290, stock: 30, leadDays: 0, featured: false, active: true, image: "/img/p-adesivos.webp",
    description: "Corações, margaridas e laços em vinil. 24 adesivos por cartela.", options: [],
  },
  {
    id: "p13", slug: "etiquetas-escolares", name: "Etiquetas escolares", line: "etiquetas", mode: "demanda",
    price: 3490, stock: null, leadDays: 5, featured: true, active: true, image: "/img/p-etiquetas.webp",
    description: "Kit de etiquetas resistentes à água para cadernos, lápis, potes e roupas.",
    options: [
      opt.name("Nome da criança", 22),
      { id: "turma", type: "text", label: "Turma ou série (opcional)", maxLength: 16, required: false },
      opt.select("kit", "Quantidade", [{ label: "Kit com 50", delta: 0 }, { label: "Kit com 100", delta: 2500 }]),
      opt.select("tema", "Tema", [{ label: "Xadrez rosa", delta: 0 }, { label: "Floral", delta: 0 }, { label: "Margaridas", delta: 0 }]),
    ],
  },
  {
    id: "p14", slug: "etiquetas-para-caderno", name: "Etiquetas para caderno", line: "etiquetas", mode: "pronta",
    price: 1490, stock: 25, leadDays: 0, featured: false, active: true, image: "/img/p-etiquetas.webp",
    description: "Etiquetas xadrez rosa com espaço para escrever à mão. 12 unidades.", options: [],
  },
  {
    id: "p15", slug: "imas-personalizados-com-foto", name: "Ímãs personalizados com foto", line: "imas", mode: "demanda",
    price: 2790, stock: null, leadDays: 4, featured: true, active: true, image: "/img/p-imas.webp",
    description: "Ímãs com a sua foto, recortados redondos ou em formato de flor.",
    options: [
      opt.select("kit", "Quantidade", [{ label: "Kit com 4", delta: 0 }, { label: "Kit com 8", delta: 2000 }]),
      opt.select("formato", "Formato", [{ label: "Redondo", delta: 0 }, { label: "Flor", delta: 300 }]),
      opt.photo(true),
    ],
  },
  {
    id: "p16", slug: "dupla-imas-flor-e-coracao", name: "Dupla de ímãs flor e coração", line: "imas", mode: "pronta",
    price: 1690, stock: 15, leadDays: 0, featured: false, active: true, image: "/img/p-imas.webp",
    description: "Um ímã de flor em aquarela e um redondo com coração.", options: [],
  },
];

export const COUPONS = [
  { code: "BEMVINDA10", type: "percent", value: 10, minOrder: 0, active: true },
  { code: "ATELIE15", type: "fixed", value: 1500, minOrder: 12000, active: true },
];

export const SETTINGS = {
  whatsapp: "5543984221611",
  instagram: "thaisdepaulatelie",
  shippingFlat: 1890,
  freeShippingMin: 19900,
  readyShipDays: 2,
  adminPin: "2611",
};

export const IMAGE_CHOICES = [
  "/img/p-caderno.webp", "/img/p-bloco.webp", "/img/p-lapis.webp", "/img/p-polaroide.webp",
  "/img/p-quadro.webp", "/img/p-adesivos.webp", "/img/p-etiquetas.webp", "/img/p-imas.webp",
];
