export interface Profile {
  id: string;
  nome?: string;
  wpp?: string;
  cidade?: string;
  insta?: string;
  especialidade?: string;
  cpf?: string;
  endereco?: string;
  prazo_min?: number;
  prazo_max?: number;
  validade?: number;
  rodape?: string;
  logo?: string;
  updated_at?: string;
}

export interface Medida {
  nome: string;
  l: string;
  a: string;
  p: string;
}

export interface Ambiente {
  id: string;
  tipo: string;
  pecas: Medida[];
  detalhes?: string;
}

export interface Proposta {
  id: string;
  user_id: string;
  numero: number;
  cliente_nome: string;
  cliente_wpp: string;
  cliente_end?: string;
  cliente_ref?: string;
  ambientes: Ambiente[];
  medidas?: any;
  chapa?: string;
  acabamento?: string;
  ferragens?: string;
  detalhes?: string;
  inicio?: string;
  entrega?: string;
  prazo_obs?: string;
  v_mat?: number;
  v_despesas?: number;
  v_ferr?: number;
  v_outros?: number;
  v_margem?: number;
  v_total: number;
  garantia?: string;
  incluso?: string;
  excluso?: string;
  validade?: string;
  pgto_formas?: string[];
  pgto_condicao?: string;
  pgto_parcelas?: number;
  pgto_juros?: boolean;
  pgto_pix?: string;
  pgto_pix_tipo?: string;
  obs_final?: string;
  status: 'nao_enviada' | 'enviada';
  created_at: string;
  updated_at: string;
}
