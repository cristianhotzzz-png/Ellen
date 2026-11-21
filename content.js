// Textos fixos do sistema: frases motivacionais, curiosidades e mensagens de fé.

// As 25 frases, exatamente como combinado.
export const QUOTES = [
  'Deus abençoa cada detalhe feito com amor e dedicação.',
  'Suas mãos não fazem apenas unhas bonitas, elas transformam autoestima.',
  'Cada cliente que chega é uma nova oportunidade de fazer a diferença.',
  'Você nasceu para florescer, crescer e realizar grandes sonhos.',
  'Que Nossa Senhora guie suas mãos e ilumine seu trabalho.',
  'Seu talento é um presente de Deus. Sua dedicação faz esse presente brilhar.',
  'Nunca subestime o poder de uma mulher determinada e cheia de fé.',
  'Cada pequeno progresso é uma vitória que merece ser celebrada.',
  'Seu trabalho carrega carinho, talento e um pedacinho do seu coração.',
  'Deus conhece seus sonhos e acompanha cada passo da sua caminhada.',
  'A beleza começa nas mãos, mas o verdadeiro encanto vem do coração.',
  'Você é capaz de conquistar muito mais do que imagina.',
  'Que hoje suas mãos trabalhem com leveza e seu coração permaneça em paz.',
  'O sucesso é construído com fé, coragem e dedicação diária.',
  'Cada unha finalizada representa mais um passo em direção aos seus sonhos.',
  'Confie no seu talento, respeite seu tempo e nunca deixe de acreditar.',
  'Que Jesus abençoe seu dia, suas clientes e cada atendimento.',
  'Você não precisa ser perfeita, apenas continuar dando o seu melhor.',
  'Sua delicadeza é uma força, e sua determinação é uma inspiração.',
  'Que seu estúdio seja sempre um lugar de beleza, acolhimento e bênçãos.',
  'Tudo aquilo que é feito com amor tem um brilho especial.',
  'O esforço de hoje está construindo as conquistas de amanhã.',
  'Deus abriu caminhos até aqui e continuará iluminando seus próximos passos.',
  'Você transforma pequenos detalhes em grandes momentos de felicidade.',
  'Que nunca faltem fé para continuar, coragem para crescer e motivos para sorrir.',
];

// Curiosidades curtas e cautelosas (sem afirmações médicas).
export const CURIOSITIES = [
  {
    t: 'A origem da manicure',
    x: 'O cuidado com as unhas é antigo: no Egito antigo a henna era usada para colorir as unhas, e na China antiga a cor das unhas chegou a estar ligada à posição social. A palavra "manicure" vem do latim: manus (mão) e cura (cuidado).',
  },
  {
    t: 'Como surgiram os esmaltes modernos',
    x: 'Segundo a história mais contada, o esmalte moderno foi inspirado nas tintas de automóveis dos anos 1920 e depois se popularizou com a indústria de cosméticos ao longo do século XX.',
  },
  {
    t: 'A evolução do alongamento',
    x: 'As unhas acrílicas costumam ser creditadas a um dentista americano, Fred Slack, que na década de 1950 adaptou materiais odontológicos para reconstruir uma unha quebrada. Os géis ganharam espaço nas décadas seguintes.',
  },
  {
    t: 'Gel e soft gel',
    x: 'Em geral, géis mais rígidos dão mais estrutura ao alongamento, enquanto géis mais flexíveis acompanham melhor o movimento da unha. Os nomes e as técnicas variam conforme a marca e a profissional.',
  },
  {
    t: 'Preparação e durabilidade',
    x: 'A preparação da unha (limpeza, remoção de oleosidade e cuidado com a cutícula) costuma ser apontada por fabricantes e profissionais como um dos fatores que mais influenciam a durabilidade do trabalho.',
  },
  {
    t: 'Higienização dos instrumentos',
    x: 'Materiais reutilizáveis precisam passar por limpeza e desinfecção ou esterilização conforme as normas sanitárias, e itens descartáveis nunca devem ser reaproveitados. É um cuidado que protege a cliente e a profissional.',
  },
  {
    t: 'Tendências de cores',
    x: 'As cores de esmalte acompanham a moda. Desde o ano 2000 a Pantone escolhe uma "cor do ano", e esses tons costumam inspirar também a maquiagem e as unhas.',
  },
  {
    t: 'Autocuidado e autoestima',
    x: 'Para muitas pessoas, reservar um momento de cuidado com as mãos é uma forma de autocuidado e de se sentir bem. Por isso o atendimento acolhedor faz tanta diferença.',
  },
  {
    t: 'O cuidado com as cutículas',
    x: 'A cutícula funciona como uma barreira de proteção ao redor da unha. Por isso, o recomendado é remover com cuidado apenas a pele solta, evitando machucar a região.',
  },
  {
    t: 'O formato das unhas',
    x: 'O formato muda o visual das mãos: formatos alongados, como amêndoa, tendem a dar a impressão de dedos mais finos e compridos, enquanto formatos curtos e quadrados passam mais praticidade.',
  },
];

export const FAITH = [
  'Entregue seus planos a Deus e siga com fé.',
  'Que Nossa Senhora cubra seu trabalho de bênçãos.',
  'Faça tudo com amor, fé e gratidão.',
  'Quem confia em Deus caminha com o coração em paz.',
  'Que cada atendimento seja feito com carinho e termine em gratidão.',
  'Nossa Senhora passa na frente e abre os caminhos do seu dia.',
  'Comece o dia agradecendo: o que é feito com fé floresce.',
  'Que a paz de Cristo acompanhe suas mãos e suas clientes.',
];

/** Escolhe um índice aleatório diferente do último usado (guardado no navegador). */
export function pickNoRepeat(key, length) {
  let last = -1;
  try {
    last = parseInt(localStorage.getItem(key) ?? '-1', 10);
  } catch (_) {}
  let i = Math.floor(Math.random() * length);
  if (length > 1 && i === last) i = (i + 1 + Math.floor(Math.random() * (length - 1))) % length;
  try {
    localStorage.setItem(key, String(i));
  } catch (_) {}
  return i;
}
