import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { Profile, Proposta, Medida } from './types';
import { generateProposalPDF } from './lib/pdf';
import { 
  LogOut, 
  Plus, 
  Settings, 
  FileText, 
  Search, 
  Trash2, 
  Eye, 
  Edit2, 
  MessageCircle, 
  ChevronRight, 
  ChevronLeft, 
  Save, 
  Camera, 
  X,
  Maximize,
  CheckCircle2,
  AlertCircle,
  Zap,
  ShieldCheck,
  Layout,
  Play,
  Home,
  Calculator,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- UTILS ---
const fmt = (val: number) => 'R$ ' + (val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const formatPhone = (val: string) => {
  const clean = val.replace(/\D/g, '');
  if (clean.length <= 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3').slice(0, 14);
  }
  return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').slice(0, 15);
};

const formatCPFCNPJ = (val: string) => {
  const clean = val.replace(/\D/g, '');
  if (clean.length <= 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
  }
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
};

// --- COMPONENTS ---
const Toast = ({ message, type = 'success', onClose }: { message: string, type?: 'success' | 'error', onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 50, x: '-50%' }}
    animate={{ opacity: 1, y: 0, x: '-50%' }}
    exit={{ opacity: 0, y: 50, x: '-50%' }}
    className={cn(
      "fixed bottom-24 left-1/2 z-[9999] px-6 py-3 rounded-full text-white text-sm font-medium shadow-lg flex items-center gap-2",
      type === 'success' ? "bg-zinc-900" : "bg-red-600"
    )}
  >
    {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
    {message}
  </motion.div>
);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'propostas' | 'orcamento' | 'perfil' | 'preview' | 'tutorial' | 'calculadora'>('tutorial');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPersistedProfile, setHasPersistedProfile] = useState(false);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredPropostas = propostas.filter(p => {
    const matchesSearch = (p.cliente_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.tipo_movel || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '' || 
                         (statusFilter === 'nao_enviada' && (p.status === 'nao_enviada' || p.status === 'ativa' || !p.status)) ||
                         (statusFilter === 'enviada' && (p.status === 'enviada' || p.status === 'fechada'));
    return matchesSearch && matchesStatus;
  });
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<Proposta>>({
    ambientes: [],
    chapa: 'MDF 15mm',
    acabamento: '',
    ferragens: '',
    v_margem: 30,
    status: 'nao_enviada',
    pgto_formas: ['Dinheiro', 'PIX'],
    pgto_parcelas: 1,
    pgto_juros: false
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatPixKey = (val: string, type: string) => {
    switch (type) {
      case 'CPF':
      case 'CNPJ':
        return formatCPFCNPJ(val);
      case 'Celular':
        return formatPhone(val);
      default:
        return val;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Auth session error:', error);
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
        if (session) {
          fetchProfile(session.user.id);
          fetchPropostas(session.user.id);
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Handle potential token issues by ensuring session is synced
      }
      
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchPropostas(session.user.id);
      } else {
        setProfile(null);
        setPropostas([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Guard: If profile not set, only allow tutorial or perfil
  useEffect(() => {
    if (session && !loading) {
      if (!hasPersistedProfile && currentPage !== 'tutorial' && currentPage !== 'perfil') {
        setCurrentPage('tutorial');
      }
    }
  }, [hasPersistedProfile, currentPage, session, loading]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      let userName = data.user_name || '';
      let unit = 'mm';
      
      // Try to parse especialidade as JSON for extended fields
      if (data.especialidade) {
        if (data.especialidade.startsWith('{')) {
          try {
            const parsed = JSON.parse(data.especialidade);
            userName = parsed.user_name || userName;
            unit = parsed.unidade_medida || unit;
          } catch (e) {
            userName = data.especialidade;
          }
        } else {
          userName = data.especialidade;
        }
      }

      setProfile({ ...data, user_name: userName, unidade_medida: unit });
      if (data.nome) setHasPersistedProfile(true);
    }
  };

  const fetchPropostas = async (userId: string) => {
    const { data, error } = await supabase.from('propostas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching propostas:', error);
      return;
    }

    if (data) {
      // Map 'medidas' back to 'ambientes' and other fields if necessary
      const mappedData = data.map(p => {
        if (p.medidas && typeof p.medidas === 'object' && !Array.isArray(p.medidas)) {
          // New nested structure
          const m = p.medidas as any;
          return { 
            ...p, 
            ambientes: m.ambientes || [],
            // Restore client fields
            cliente_end: m.cliente?.endereco || p.cliente_end,
            cliente_ref: m.cliente?.referencia || p.cliente_ref,
            // Restore financial fields
            v_mat: m.financeiro?.v_mat,
            v_despesas: m.financeiro?.v_despesas,
            v_ferr: m.financeiro?.v_ferr,
            v_outros: m.financeiro?.v_outros,
            v_margem: m.financeiro?.v_margem,
            // Restore technical fields
            chapa: m.detalhes_tecnicos?.chapa,
            acabamento: m.detalhes_tecnicos?.acabamento,
            ferragens: m.detalhes_tecnicos?.ferragens,
            detalhes: m.detalhes_tecnicos?.detalhes,
            inicio: m.detalhes_tecnicos?.inicio,
            entrega: m.detalhes_tecnicos?.entrega,
            prazo_obs: m.detalhes_tecnicos?.prazo_obs,
            garantia: m.detalhes_tecnicos?.garantia,
            incluso: m.detalhes_tecnicos?.incluso,
            excluso: m.detalhes_tecnicos?.excluso,
            obs_final: m.detalhes_tecnicos?.obs_final,
            // Restore payment fields
            pgto_formas: m.pgto?.formas || ['Dinheiro', 'PIX'],
            pgto_parcelas: m.pgto?.parcelas || 1,
            pgto_juros: m.pgto?.juros || false,
            pgto_pix: m.pgto?.pix || '',
            pgto_pix_tipo: m.pgto?.pix_tipo || 'CPF',
            pgto_condicao: m.pgto?.condicao || ''
          };
        }
        if (p.medidas && Array.isArray(p.medidas) && p.medidas.length > 0 && !p.ambientes) {
          // Old structure (array of ambientes)
          return { ...p, ambientes: p.medidas };
        }
        return p;
      });
      setPropostas(mappedData);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPropostas([]);
  };

  const handleSaveProposta = async () => {
    if (!session?.user) return;

    const mat = Number(formData.v_mat) || 0;
    const despesas = Number(formData.v_despesas) || 0;
    const ferr = Number(formData.v_ferr) || 0;
    const out = Number(formData.v_outros) || 0;
    const marg = Number(formData.v_margem) || 0;
    const sub = mat + despesas + ferr + out;
    const total = sub + sub * (marg / 100);

    // Destructure to remove fields not present in the database schema
    const { 
      ambientes, 
      pgto_formas, 
      pgto_parcelas, 
      pgto_juros, 
      pgto_pix, 
      pgto_pix_tipo,
      pgto_condicao,
      v_mat,
      v_despesas,
      v_ferr,
      v_outros,
      v_margem,
      chapa,
      acabamento,
      ferragens,
      detalhes,
      inicio,
      entrega,
      prazo_obs,
      garantia,
      incluso,
      excluso,
      obs_final,
      cliente_end,
      cliente_ref,
      ...rest 
    } = formData;

    const payload = {
      ...rest,
      user_id: session.user.id,
      v_total: total,
      status: 'enviada', // Force status to 'enviada' as requested
      updated_at: new Date().toISOString(),
      created_at: formData.created_at || new Date().toISOString(),
      numero: formData.numero || propostas.length + 1,
      // Compatibility fields: store the rich structure in 'medidas' column
      tipo_movel: ambientes?.[0]?.tipo || 'Móvel Planejado',
      medidas: {
        ambientes: ambientes || [],
        cliente: {
          endereco: cliente_end,
          referencia: cliente_ref
        },
        financeiro: {
          v_mat,
          v_despesas,
          v_ferr,
          v_outros,
          v_margem
        },
        detalhes_tecnicos: {
          chapa,
          acabamento,
          ferragens,
          detalhes,
          inicio,
          entrega,
          prazo_obs,
          garantia,
          incluso,
          excluso,
          obs_final
        },
        pgto: {
          formas: pgto_formas,
          parcelas: pgto_parcelas,
          juros: pgto_juros,
          pix: pgto_pix,
          pix_tipo: pgto_pix_tipo,
          condicao: pgto_condicao
        }
      }
    };

    try {
      let { error, data: savedData } = editingId 
        ? await supabase.from('propostas').update(payload).eq('id', editingId).select()
        : await supabase.from('propostas').insert(payload).select();

      if (error) {
        console.error('Supabase Save Error:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
        return;
      }

      showToast('Proposta enviada com sucesso!');
      fetchPropostas(session.user.id);
      
      // Reconstruct the proposal for the preview/state
      const savedProposta = (savedData?.[0] || payload) as Proposta;
      
      // Map back for local state consistency
      const mappedProposta = {
        ...savedProposta,
        ambientes: payload.medidas.ambientes,
        v_mat: payload.medidas.financeiro.v_mat,
        v_despesas: payload.medidas.financeiro.v_despesas,
        v_ferr: payload.medidas.financeiro.v_ferr,
        v_outros: payload.medidas.financeiro.v_outros,
        v_margem: payload.medidas.financeiro.v_margem,
        chapa: payload.medidas.detalhes_tecnicos.chapa,
        acabamento: payload.medidas.detalhes_tecnicos.acabamento,
        ferragens: payload.medidas.detalhes_tecnicos.ferragens,
        detalhes: payload.medidas.detalhes_tecnicos.detalhes,
        inicio: payload.medidas.detalhes_tecnicos.inicio,
        entrega: payload.medidas.detalhes_tecnicos.entrega,
        prazo_obs: payload.medidas.detalhes_tecnicos.prazo_obs,
        garantia: payload.medidas.detalhes_tecnicos.garantia,
        incluso: payload.medidas.detalhes_tecnicos.incluso,
        excluso: payload.medidas.detalhes_tecnicos.excluso,
        obs_final: payload.medidas.detalhes_tecnicos.obs_final,
        pgto_formas: payload.medidas.pgto.formas,
        pgto_parcelas: payload.medidas.pgto.parcelas,
        pgto_juros: payload.medidas.pgto.juros,
        pgto_pix: payload.medidas.pgto.pix,
        pgto_pix_tipo: payload.medidas.pgto.pix_tipo,
        pgto_condicao: payload.medidas.pgto.condicao,
        cliente_end: payload.medidas.cliente.endereco,
        cliente_ref: payload.medidas.cliente.referencia
      };
      
      setFormData(mappedProposta);
      setCurrentPage('preview');
      
      if (profile) {
        generateProposalPDF(mappedProposta, profile);
      }
    } catch (err: any) {
      console.error('Unexpected Save Error:', err);
      showToast('Erro inesperado: ' + err.message, 'error');
    }
  };

  const handleDeleteProposta = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.')) return;
    
    try {
      const { error } = await supabase.from('propostas').delete().eq('id', id);
      
      if (error) {
        console.error('Delete error:', error);
        showToast('Erro ao excluir: ' + error.message, 'error');
      } else {
        showToast('Proposta excluída com sucesso');
        if (session?.user) {
          fetchPropostas(session.user.id);
        }
      }
    } catch (err: any) {
      console.error('Unexpected delete error:', err);
      showToast('Erro inesperado ao excluir', 'error');
    }
  };

  const handleUpdateStatus = async (id: string, status: 'enviada' | 'nao_enviada') => {
    const { error } = await supabase.from('propostas').update({ status }).eq('id', id);
    if (!error) {
      if (session?.user) fetchPropostas(session.user.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="text-3xl font-bold text-brand-red tracking-tighter">Fifty+</div>
        <div className="w-8 h-8 border-2 border-zinc-800 border-t-brand-red rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen showToast={showToast} />;
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-52 bg-white border-r border-brand-border flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-brand-border">
          <button 
            onClick={() => setCurrentPage('tutorial')}
            className="text-2xl font-semibold text-brand-red tracking-tight hover:opacity-80 transition-opacity"
          >
            Fifty+
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1.5">
          <button 
            onClick={() => setCurrentPage('tutorial')}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm transition-all",
              currentPage === 'tutorial' ? "bg-brand-red text-white shadow-md shadow-brand-red/10" : "text-brand-text3 hover:bg-brand-surface2"
            )}
          >
            <Home size={16} strokeWidth={1.5} /> INÍCIO
          </button>
          
          <button 
            onClick={() => setCurrentPage('perfil')}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm transition-all",
              currentPage === 'perfil' ? "bg-brand-red text-white shadow-md shadow-brand-red/10" : "text-brand-text3 hover:bg-brand-surface2"
            )}
          >
            <Settings size={16} strokeWidth={1.5} /> PERFIL
          </button>

          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({
                ambientes: [],
                chapa: 'MDF 15mm',
                acabamento: '',
                ferragens: '',
                v_margem: 30,
                status: 'nao_enviada',
                pgto_formas: ['Dinheiro', 'PIX'],
                pgto_parcelas: 1,
                pgto_juros: false
              });
              setCurrentStep(1);
              setCurrentPage('orcamento');
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm transition-all",
              currentPage === 'orcamento' ? "bg-brand-red text-white shadow-md shadow-brand-red/10" : "text-brand-text3 hover:bg-brand-surface2"
            )}
          >
            <Plus size={16} strokeWidth={1.5} /> NOVO ORÇAMENTO
          </button>

          <button 
            onClick={() => setCurrentPage('propostas')}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm transition-all",
              currentPage === 'propostas' ? "bg-brand-red text-white shadow-md shadow-brand-red/10" : "text-brand-text3 hover:bg-brand-surface2"
            )}
          >
            <FileText size={16} strokeWidth={1.5} /> LISTA
          </button>

          <button 
            onClick={() => setCurrentPage('calculadora')}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm transition-all",
              currentPage === 'calculadora' ? "bg-brand-red text-white shadow-md shadow-brand-red/10" : "text-brand-text3 hover:bg-brand-surface2"
            )}
          >
            <Calculator size={16} strokeWidth={1.5} /> CALCULADORA
          </button>
        </nav>

        <div className="p-4 border-t border-brand-border">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium text-sm text-brand-text3 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={16} strokeWidth={1.5} /> SAIR
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar for Mobile */}
        <header className="md:hidden sticky top-0 z-50 bg-white border-b border-brand-border px-4 h-14 flex items-center justify-between">
          <button 
            onClick={() => setCurrentPage('tutorial')}
            className="text-xl font-semibold text-brand-red tracking-tight hover:opacity-80 transition-opacity"
          >
            Fifty+
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center text-xs font-bold">
              {session.user.email?.[0].toUpperCase()}
            </div>
            <button onClick={handleLogout} className="p-2 text-brand-text3 hover:text-brand-red transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            {currentPage === 'tutorial' && (
              <motion.div
                key="tutorial"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <TutorialPage 
                  onStart={() => setCurrentPage('orcamento')} 
                  hasPersistedProfile={hasPersistedProfile}
                  setCurrentPage={setCurrentPage}
                  profile={profile}
                />
              </motion.div>
            )}

            {currentPage === 'propostas' && (
              <motion.div 
                key="propostas"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="max-w-2xl mx-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-semibold text-brand-text1">Seus Orçamentos</h2>
                  <button 
                    onClick={() => {
                      setEditingId(null);
                      setFormData({
                        ambientes: [],
                        chapa: 'MDF 15mm',
                        acabamento: '',
                        ferragens: '',
                        v_margem: 30,
                        status: 'nao_enviada',
                        pgto_formas: ['Dinheiro', 'PIX'],
                        pgto_parcelas: 1,
                        pgto_juros: false
                      });
                      setCurrentStep(1);
                      setCurrentPage('orcamento');
                    }}
                    className="bg-brand-red text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-brand-red/20 text-xs"
                  >
                    <Plus size={16} /> Novo Orçamento
                  </button>
                </div>

                <div className="flex gap-2 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text3" size={20} />
                    <input 
                      type="text" 
                      placeholder="Buscar cliente pelo nome..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-white border-2 border-brand-border rounded-2xl pl-12 pr-4 py-4 text-base font-medium focus:border-brand-red transition-all outline-none shadow-sm text-center"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {filteredPropostas.length === 0 ? (
                    <div className="py-16 text-center text-brand-text3 bg-white rounded-3xl border-2 border-brand-border border-dashed">
                      <FileText size={64} className="mx-auto mb-4 opacity-10" />
                      <p className="font-bold text-lg">Nenhum orçamento encontrado.</p>
                      <p className="text-sm opacity-60">Toque em "+ Novo Orçamento" para começar.</p>
                    </div>
                  ) : (
                    filteredPropostas.map(p => (
                      <div key={p.id} className="bg-white border-2 border-brand-border rounded-3xl p-5 shadow-md hover:shadow-lg transition-all active:scale-[0.99]">
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-brand-text3 uppercase tracking-[0.2em]">
                              #{String(p.numero).padStart(3, '0')} • {new Date(p.created_at).toLocaleDateString()}
                            </p>
                            <h3 className="font-semibold text-lg md:text-xl text-brand-text1 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{p.cliente_nome}</h3>
                            <p className="text-xs md:text-sm font-medium text-brand-red uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">{p.tipo_movel}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-brand-green text-xl">{fmt(p.v_total)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 pt-4 border-t-2 border-brand-border">
                          <button 
                            onClick={() => { setFormData(p); setCurrentPage('preview'); }}
                            className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl bg-brand-surface2 text-brand-text2 hover:bg-brand-red/5 hover:text-brand-red transition-all active:scale-90 border border-transparent hover:border-brand-red/20"
                          >
                            <Eye size={20} strokeWidth={2.5} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Ver</span>
                          </button>
                          <button 
                            onClick={() => {
                              setEditingId(p.id);
                              setFormData(p);
                              setCurrentStep(1);
                              setCurrentPage('orcamento');
                            }}
                            className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl bg-brand-surface2 text-brand-text2 hover:bg-brand-red/5 hover:text-brand-red transition-all active:scale-90 border border-transparent hover:border-brand-red/20"
                          >
                            <Edit2 size={20} strokeWidth={2.5} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Editar</span>
                          </button>
                          <button 
                            onClick={() => handleDeleteProposta(p.id)}
                            className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 transition-all active:scale-90 border border-transparent hover:border-red-200"
                          >
                            <Trash2 size={20} strokeWidth={2.5} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Excluir</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {currentPage === 'orcamento' && (
              <motion.div 
                key="orcamento"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl mx-auto"
              >
                <OrcamentoForm 
                  step={currentStep} 
                  setStep={setCurrentStep} 
                  data={formData} 
                  setData={setFormData} 
                  onSave={handleSaveProposta}
                  onCancel={() => setCurrentPage('propostas')}
                  profile={profile}
                />
              </motion.div>
            )}

            {currentPage === 'preview' && (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl mx-auto"
              >
                <PreviewPage 
                  proposta={formData as Proposta} 
                  profile={profile!} 
                  onBack={() => setCurrentPage('propostas')} 
                  onStatusUpdate={handleUpdateStatus}
                />
              </motion.div>
            )}

            {currentPage === 'perfil' && (
              <motion.div 
                key="perfil"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto"
              >
                <ProfilePage 
                  profile={profile} 
                  setProfile={setProfile} 
                  userId={session.user.id} 
                  showToast={showToast}
                  setCurrentPage={setCurrentPage}
                  onSaveSuccess={() => {
                    setHasPersistedProfile(true);
                    fetchProfile(session.user.id);
                  }}
                />
              </motion.div>
            )}

            {currentPage === 'calculadora' && (
              <motion.div
                key="calculadora"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-md mx-auto"
              >
                <FullCalculator />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Nav for Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-brand-border px-6 py-2 flex items-center justify-between z-50">
          <button 
            onClick={() => setCurrentPage('tutorial')}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-2xl transition-all duration-300",
              currentPage === 'tutorial' ? "text-brand-red" : "text-brand-text3"
            )}
          >
            <Home size={20} strokeWidth={currentPage === 'tutorial' ? 2.5 : 2} />
            <span className="text-[9px] uppercase tracking-tight font-semibold">Início</span>
          </button>

          <button 
            onClick={() => setCurrentPage('perfil')}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-2xl transition-all duration-300",
              currentPage === 'perfil' ? "text-brand-red" : "text-brand-text3"
            )}
          >
            <Settings size={20} strokeWidth={currentPage === 'perfil' ? 2.5 : 2} />
            <span className="text-[9px] uppercase tracking-tight font-semibold">Perfil</span>
          </button>

          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({
                ambientes: [],
                chapa: 'MDF 15mm',
                acabamento: '',
                ferragens: '',
                v_margem: 30,
                status: 'nao_enviada',
                pgto_formas: ['Dinheiro', 'PIX'],
                pgto_parcelas: 1,
                pgto_juros: false
              });
              setCurrentStep(1);
              setCurrentPage('orcamento');
            }}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-2xl transition-all duration-300",
              currentPage === 'orcamento' ? "text-brand-red" : "text-brand-text3"
            )}
          >
            <Plus size={28} strokeWidth={3} />
            <span className="text-[9px] uppercase tracking-tight font-semibold">Novo</span>
          </button>

          <button 
            onClick={() => setCurrentPage('propostas')}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-2xl transition-all duration-300",
              currentPage === 'propostas' ? "text-brand-red" : "text-brand-text3"
            )}
          >
            <FileText size={20} strokeWidth={currentPage === 'propostas' ? 2.5 : 2} />
            <span className="text-[9px] uppercase tracking-tight font-semibold">Lista</span>
          </button>

          <button 
            onClick={() => setCurrentPage('calculadora')}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-2xl transition-all duration-300",
              currentPage === 'calculadora' ? "text-brand-red" : "text-brand-text3"
            )}
          >
            <Calculator size={20} strokeWidth={currentPage === 'calculadora' ? 2.5 : 2} />
            <span className="text-[9px] uppercase tracking-tight font-semibold">Calc</span>
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

function FullCalculator() {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  const handleBtn = (val: string) => {
    if (val === 'C') {
      setDisplay('0');
      setEquation('');
      return;
    }
    if (val === '=') {
      try {
        const res = eval(equation.replace('x', '*').replace('÷', '/'));
        setDisplay(String(res));
        setEquation(String(res));
      } catch (e) {
        setDisplay('Erro');
        setEquation('');
      }
      return;
    }
    
    const isOperator = ['+', '-', 'x', '÷'].includes(val);
    if (isOperator) {
      setEquation(prev => prev + val);
      setDisplay(val); // Show operator in main display
      return;
    }

    setEquation(prev => prev === '0' ? val : prev + val);
    setDisplay(prev => (prev === '0' || ['+', '-', 'x', '÷'].includes(prev)) ? val : prev + val);
  };

  return (
    <div className="bg-zinc-900 text-white p-8 rounded-[3rem] shadow-2xl border border-white/10 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-8 px-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Calculadora Profissional</span>
      </div>
      
      <div className="bg-black/60 p-8 rounded-3xl mb-8 text-right overflow-hidden min-h-[120px] flex flex-col justify-end border border-white/5">
        <div className="text-base text-zinc-400 h-6 truncate mb-2 font-mono">{equation}</div>
        <div className="text-5xl font-bold truncate font-mono">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {['C', '÷', 'x', '-', '7', '8', '9', '+', '4', '5', '6', '=', '1', '2', '3', '0'].map((btn) => (
          <button
            key={btn}
            onClick={() => handleBtn(btn)}
            className={cn(
              "h-20 rounded-2xl font-bold text-2xl transition-all active:scale-90 flex items-center justify-center",
              btn === 'C' ? "bg-zinc-800 text-brand-red" :
              ['÷', 'x', '-', '+', '='].includes(btn) ? "bg-brand-red text-white shadow-lg shadow-brand-red/20" : "bg-zinc-800 text-white hover:bg-zinc-700"
            )}
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NewsCarousel({ setCurrentPage }: { setCurrentPage: (p: string) => void }) {
  const [index, setIndex] = useState(0);
  const total = 6;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % total);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const banners = [
    {
      tag: '🏆 COPA DO MUNDO',
      title: 'Entre no clima da Copa com orçamentos campeões',
      sub: 'Mostre para seus clientes que sua marcenaria joga no time da elite.',
      action: () => setCurrentPage('form'),
      bg: 'bg-gradient-to-br from-[#009739] via-[#FEDD00] to-[#012169]',
      textColor: 'text-white',
      tagBg: 'bg-white/20 text-white',
    },
    {
      tag: '⚡ COMECE AGORA',
      title: 'Sua proposta em PDF em menos de 5 minutos',
      sub: 'Preenche no celular, gera o PDF com sua logo e manda pelo WhatsApp.',
      action: () => setCurrentPage('form'),
      bg: 'bg-[#111111]',
      textColor: 'text-white',
      tagBg: 'bg-brand-red/20 text-brand-red',
    },
    {
      tag: '✅ IDENTIDADE PROFISSIONAL',
      title: 'Sua logo aparece em todas as propostas automaticamente',
      sub: 'Configure uma vez no seu perfil e nunca mais se preocupe.',
      action: () => setCurrentPage('profile'),
      bg: 'bg-gradient-to-br from-[#D42B2B] to-[#AA2020]',
      textColor: 'text-white',
      tagBg: 'bg-white/20 text-white',
    },
    {
      tag: '📊 FERRAMENTA EXCLUSIVA',
      title: 'Descubra quanto cobrar em cada projeto',
      sub: 'Use a calculadora de custos e pare de trabalhar no prejuízo.',
      action: () => setCurrentPage('calculator'),
      bg: 'bg-[#0F172A]',
      textColor: 'text-white',
      tagBg: 'bg-blue-500/20 text-blue-400',
    },
    {
      tag: '☁️ SEUS DADOS SALVOS',
      title: 'Todas as suas propostas salvas na nuvem',
      sub: 'Acesse de qualquer celular. Nunca mais perca um orçamento.',
      action: () => setCurrentPage('propostas'),
      bg: 'bg-white border-2 border-[#EEEEEE]',
      textColor: 'text-brand-text1',
      tagBg: 'bg-zinc-100 text-zinc-500',
    },
    {
      tag: '🎁 PROGRAMA DE INDICAÇÃO',
      title: 'Indique um amigo marceneiro e ganhe 1 mês grátis',
      sub: 'Ele também ganha desconto. Todo mundo sai ganhando.',
      action: () => window.open('https://wa.me/?text=Olá! Estou usando o Fifty+ para meus orçamentos e é excelente. Use meu link para ganhar desconto!'),
      bg: 'bg-[#111111]',
      textColor: 'text-white',
      tagBg: 'bg-[#FFE566] text-black',
    }
  ];

  return (
    <div className="pb-6 font-dm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-brand-text1 uppercase tracking-wider">Novidades</h3>
        <div className="flex gap-1">
          {banners.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                index === i ? "w-4 bg-brand-red" : "w-1 bg-brand-border"
              )}
            />
          ))}
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-3xl border-2 border-brand-border bg-white shadow-sm hover:shadow-md transition-all duration-500">
        <motion.div 
          className="flex cursor-grab active:cursor-grabbing"
          animate={{ x: `-${index * 100}%` }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50 && index < total - 1) setIndex(index + 1);
            if (info.offset.x > 50 && index > 0) setIndex(index - 1);
          }}
        >
          {banners.map((b, i) => (
            <div 
              key={i} 
              className={cn(
                "min-w-full min-h-[140px] md:min-h-[120px] p-6 flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden shrink-0 cursor-pointer",
                b.bg.includes('white') ? 'bg-white' : b.bg
              )}
              onClick={b.action}
            >
              <div className="flex-1 min-w-0 space-y-2 relative z-10 flex flex-col items-center justify-center">
                <div className="flex items-center gap-2 justify-center">
                  <span className={cn("px-2 py-0.5 rounded text-[8px] font-medium uppercase tracking-widest", b.tagBg)}>
                    {b.tag.split(' ')[0]}
                  </span>
                  <span className={cn("text-[8px] font-medium uppercase tracking-widest opacity-60", b.textColor)}>
                    {b.tag.split(' ').slice(1).join(' ')}
                  </span>
                </div>
                <h4 className={cn("text-sm md:text-base font-medium leading-tight", b.textColor)}>
                  {b.title}
                </h4>
                <p className={cn("text-[9px] md:text-[10px] opacity-80 leading-relaxed font-normal max-w-md", b.textColor)}>
                  {b.sub}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function TutorialPage({ onStart, hasPersistedProfile, setCurrentPage, profile }: { onStart: () => void, hasPersistedProfile: boolean, setCurrentPage: (p: string) => void, profile: any }) {
  const steps = [
    { title: '1. Perfil', desc: 'Logo e dados.', icon: <Settings size={18} />, color: 'bg-blue-500' },
    { title: '2. Proposta', desc: 'Inicie rápido.', icon: <Plus size={18} />, color: 'bg-emerald-500' },
    { title: '3. Ambientes', desc: 'Escolha cômodos.', icon: <Layout size={18} />, color: 'bg-amber-500' },
    { title: '4. Medidas', desc: 'Dimensões técnicas.', icon: <Maximize size={18} />, color: 'bg-purple-500' },
    { title: '5. Orçamento', desc: 'Gere o PDF.', icon: <FileText size={18} />, color: 'bg-brand-red' },
  ];

  const formatName = (name: string) => {
    if (!name) return '';
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  return (
    <div className="space-y-6 py-4 max-w-3xl mx-auto px-4">
      <div className="text-center space-y-2 max-w-full overflow-hidden">
        <h2 className="text-xl md:text-2xl font-medium text-brand-text1 tracking-tighter flex items-center justify-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis px-2">
          Bem-vindo ao <span className="text-brand-red font-medium">Fifty+</span> 
          {profile?.user_name && (
            <motion.span 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-black font-medium truncate inline-block"
            >
              {formatName(profile.user_name)}
            </motion.span>
          )}
        </h2>
        <p className="text-brand-text3 font-medium text-[10px] md:text-xs uppercase tracking-widest truncate">Sua ferramenta completa para orçamentos de marcenaria</p>
      </div>

      <NewsCarousel setCurrentPage={setCurrentPage} />

      <div className="bg-white rounded-[2rem] border-2 border-brand-border overflow-hidden shadow-sm">
        <div className="p-6 border-b border-brand-border bg-brand-surface2">
           <h3 className="text-sm font-semibold text-brand-text1 uppercase tracking-wider">Como funciona:</h3>
        </div>
        <div className="p-6 space-y-0 relative">
          {/* Trail Line */}
          <div className="absolute left-[2.75rem] top-10 bottom-10 w-0.5 bg-brand-border" />
          
          {steps.map((step, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-6 py-4 relative z-10"
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-sm border-2 border-white",
                step.color
              )}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-brand-text1 uppercase tracking-wider">{step.title}</h4>
                <p className="text-xs text-brand-text3 font-medium uppercase tracking-tighter opacity-70">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02, backgroundColor: '#E11D48' }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (hasPersistedProfile) {
            onStart();
          } else {
            setCurrentPage('perfil');
          }
        }}
        className={cn(
          "w-full py-4 rounded-2xl font-semibold text-sm shadow-xl shadow-brand-red/10 active:scale-95 transition-all uppercase tracking-widest bg-brand-red text-white border-2 border-white/10 whitespace-nowrap"
        )}
      >
        {hasPersistedProfile ? "CRIAR UM NOVO ORÇAMENTO" : "CADASTRE O SEU PERFIL AGORA"}
      </motion.button>
    </div>
  );
}

function LoginScreen({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('E-mail ou Senha incorreta.', 'error');
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) showToast(error.message, 'error');
    else showToast('Link enviado para seu e-mail!');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-semibold text-brand-red tracking-tighter mb-2">Fifty+</h1>
          <p className="text-zinc-500 text-sm font-medium">Propostas profissionais para marceneiros</p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">E-mail</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all text-center"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Senha</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all text-center"
                placeholder="••••••••"
                required
              />
            </div>
            <button 
              disabled={loading}
              className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-red-dark active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button 
              type="button"
              onClick={() => setMode('forgot')}
              className="w-full text-zinc-400 text-sm font-medium py-2"
            >
              Esqueci minha senha
            </button>
            <div className="mt-4 text-center">
              <p className="text-[10px] text-zinc-400">
                Acesso exclusivo para cliente. Adquira o acesso em{' '}
                <a 
                  href="https://fiftymais.com.br" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-brand-red font-bold hover:underline"
                >
                  fiftymais.com.br
                </a>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
             <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">E-mail cadastrado</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all text-center"
                placeholder="seu@email.com"
                required
              />
            </div>
            <button 
              disabled={loading}
              className="w-full bg-brand-red text-white py-4 rounded-2xl font-semibold text-lg hover:bg-brand-red-dark active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Recuperar Senha'}
            </button>
            <button 
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-zinc-400 text-sm font-medium py-2"
            >
              Voltar ao login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function OrcamentoForm({ step, setStep, data, setData, onSave, onCancel, profile }: any) {
  const steps = ['Cliente', 'Ambientes', 'Medidas', 'Valores', 'Pagamento'];

  const updateData = (key: string, value: any) => setData((prev: any) => ({ ...prev, [key]: value }));

  const addAmbiente = (tipo: string) => {
    const newAmbientes = [...(data.ambientes || []), { id: Date.now().toString(), tipo, pecas: [] }];
    updateData('ambientes', newAmbientes);
  };

  const removeAmbiente = (id: string) => {
    const newAmbientes = (data.ambientes || []).filter((a: any) => a.id !== id);
    updateData('ambientes', newAmbientes);
  };

  const addPeca = (ambienteId: string) => {
    const newAmbientes = (data.ambientes || []).map((a: any) => {
      if (a.id === ambienteId) {
        return { ...a, pecas: [...a.pecas, { nome: '', l: '', a: '', p: '' }] };
      }
      return a;
    });
    updateData('ambientes', newAmbientes);
  };

  const removePeca = (ambienteId: string, pecaIdx: number) => {
    const newAmbientes = (data.ambientes || []).map((a: any) => {
      if (a.id === ambienteId) {
        const newPecas = [...a.pecas];
        newPecas.splice(pecaIdx, 1);
        return { ...a, pecas: newPecas };
      }
      return a;
    });
    updateData('ambientes', newAmbientes);
  };

  const updatePeca = (ambienteId: string, pecaIdx: number, key: string, val: string) => {
    const newAmbientes = (data.ambientes || []).map((a: any) => {
      if (a.id === ambienteId) {
        const newPecas = [...a.pecas];
        newPecas[pecaIdx] = { ...newPecas[pecaIdx], [key]: val };
        return { ...a, pecas: newPecas };
      }
      return a;
    });
    updateData('ambientes', newAmbientes);
  };

  const updateAmbiente = (id: string, key: string, val: any) => {
    const newAmbientes = (data.ambientes || []).map((a: any) => {
      if (a.id === id) return { ...a, [key]: val };
      return a;
    });
    updateData('ambientes', newAmbientes);
  };

  const formatPixKey = (val: string, type: string) => {
    switch (type) {
      case 'CPF':
      case 'CNPJ':
        return formatCPFCNPJ(val);
      case 'Celular':
        return formatPhone(val);
      default:
        return val;
    }
  };

  const subtotal = (Number(data.v_mat) || 0) + (Number(data.v_despesas) || 0) + (Number(data.v_ferr) || 0) + (Number(data.v_outros) || 0);
  const total = subtotal + subtotal * ((Number(data.v_margem) || 0) / 100);
  const unit = profile?.unidade_medida || 'mm';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold uppercase tracking-tight">Nova Proposta</h2>
        <button onClick={onCancel} className="text-brand-text3"><X size={18} /></button>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest mb-2">Dados do Cliente</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Nome Completo *</label>
              <input 
                type="text" 
                value={data.cliente_nome || ''} 
                onChange={e => updateData('cliente_nome', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">WhatsApp *</label>
              <input 
                type="tel" 
                value={data.cliente_wpp || ''} 
                onChange={e => updateData('cliente_wpp', formatPhone(e.target.value))}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Endereço da Obra</label>
              <input 
                type="text" 
                value={data.cliente_end || ''} 
                onChange={e => updateData('cliente_end', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="Rua, número, bairro"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Início Montagem</label>
                <input 
                  type="date" 
                  value={data.inicio || ''} 
                  onChange={e => updateData('inicio', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Previsão Entrega</label>
                <input 
                  type="date" 
                  value={data.entrega || ''} 
                  onChange={e => updateData('entrega', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                />
              </div>
            </div>
          </div>
          <button onClick={() => setStep(2)} className="w-full bg-brand-red text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-brand-red/90 uppercase tracking-widest whitespace-nowrap shadow-lg shadow-brand-red/20">
            PRÓXIMO PASSO <ChevronRight size={18} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest">ADICIONE OS AMBIENTES</h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Cozinha', emoji: '🍳', val: 'Cozinha Planejada' },
                { label: 'G.Roupa', emoji: '🚪', val: 'Guarda-Roupa' },
                { label: 'D.Casal', emoji: '🛏️', val: 'Dormitório Casal' },
                { label: 'D.Solt.', emoji: '🛌', val: 'Dormitório Solteiro' },
                { label: 'D.Inf.', emoji: '🧸', val: 'Dormitório Infantil' },
                { label: 'Criança', emoji: '👶', val: 'Ambiente de Criança' },
                { label: 'H.Office', emoji: '💻', val: 'Home Office' },
                { label: 'Escrit.', emoji: '💼', val: 'Escritório' },
                { label: 'Recep.', emoji: '🛎️', val: 'Recepção' },
                { label: 'Closet', emoji: '👔', val: 'Closet' },
                { label: 'Banho', emoji: '🚿', val: 'Banheiro' },
                { label: 'Painel', emoji: '📺', val: 'Rack / Painel TV' },
                { label: 'Serviço', emoji: '🧺', val: 'Área de Serviço' },
                { label: 'Varanda', emoji: '🌿', val: 'Varanda' },
                { label: 'Externa', emoji: '🌳', val: 'Área Externa' },
                { label: 'Medida', emoji: '📐', val: 'Móvel Sob Medida' },
                { label: 'Pers.', emoji: '✨', val: 'Ambiente Personalizado' },
              ].map(m => (
                <button 
                  key={m.val}
                  onClick={() => addAmbiente(m.val)}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl border border-brand-border bg-brand-surface2 transition-all gap-1 hover:border-brand-red active:scale-[0.95] shadow-sm"
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="text-[10px] font-bold uppercase tracking-tighter text-brand-text2 text-center leading-none">
                    {m.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-brand-text3 uppercase tracking-widest">Ambientes Adicionados</h4>
              <div className="grid grid-cols-1 gap-2">
                {(data.ambientes || []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 px-4 bg-brand-red-light rounded-2xl border border-brand-red/20">
                    <span className="text-sm font-bold text-brand-red uppercase">{a.tipo}</span>
                    <button onClick={() => removeAmbiente(a.id)} className="text-brand-red p-1 active:scale-90 transition-transform"><X size={18} /></button>
                  </div>
                ))}
              </div>
              {(data.ambientes || []).length === 0 && <p className="text-xs text-brand-text3 italic">Nenhum ambiente adicionado.</p>}
            </div>

            <div className="space-y-4 pt-4 border-t border-brand-border">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Tipo de Chapa</label>
                <div className="flex flex-wrap gap-2">
                  {['MDF 15mm', 'MDF 18mm', 'MDP', 'Compensado'].map(c => (
                    <button 
                      key={c}
                      onClick={() => updateData('chapa', c)}
                      className={cn(
                        "px-4 py-3 rounded-xl text-xs font-bold border-2 transition-all uppercase tracking-wider",
                        data.chapa === c ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="flex-1 bg-brand-surface2 border border-brand-border py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-brand-text3 uppercase tracking-widest whitespace-nowrap">
              <ChevronLeft size={18} /> Voltar
            </button>
            <button onClick={() => setStep(3)} className="flex-[1.5] bg-brand-red text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-brand-red/90 uppercase tracking-widest whitespace-nowrap shadow-lg shadow-brand-red/20">
              Próximo Passo <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest">Medidas e Detalhes</h3>
            
            {(data.ambientes || []).map((amb: any) => (
              <div key={amb.id} className="space-y-4 p-5 bg-brand-surface2 rounded-3xl border border-brand-border">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-brand-red uppercase">{amb.tipo}</h4>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-text3 ml-1 uppercase tracking-wider">OBS: Material e detalhamento</label>
                  <textarea 
                    value={amb.detalhes || ''} 
                    onChange={e => updateAmbiente(amb.id, 'detalhes', e.target.value)}
                    className="w-full bg-white border-2 border-brand-border rounded-xl px-4 py-3 text-base focus:border-brand-red transition-all min-h-[80px] outline-none font-normal text-center"
                    placeholder="Cores, puxadores..."
                  />
                </div>
                
                <div className="space-y-4">
                  {amb.pecas.map((p: any, pIdx: number) => (
                    <div key={pIdx} className="bg-white p-5 rounded-3xl border-2 border-brand-border space-y-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <input 
                          type="text" 
                          value={p.nome} 
                          onChange={e => updatePeca(amb.id, pIdx, 'nome', e.target.value)}
                          className="flex-1 bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-brand-red transition-all uppercase text-center"
                          placeholder="Módulo/item"
                        />
                        <button onClick={() => removePeca(amb.id, pIdx)} className="text-red-500 p-1 active:scale-90 transition-transform"><Trash2 size={20} /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-brand-text3 ml-1 uppercase">Larg. ({unit})</label>
                          <input 
                            type="number" 
                            value={p.l} 
                            onChange={e => updatePeca(amb.id, pIdx, 'l', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-brand-red transition-all text-center"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-brand-text3 uppercase ml-1">Alt. ({unit})</label>
                          <input 
                            type="number" 
                            value={p.a} 
                            onChange={e => updatePeca(amb.id, pIdx, 'a', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-brand-red transition-all text-center"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-brand-text3 uppercase ml-1">Prof. ({unit})</label>
                          <input 
                            type="number" 
                            value={p.p} 
                            onChange={e => updatePeca(amb.id, pIdx, 'p', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-brand-red transition-all text-center"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => addPeca(amb.id)}
                    className="w-full py-4 border-2 border-dashed border-brand-border rounded-2xl text-brand-text3 font-bold text-xs hover:border-brand-red hover:text-brand-red transition-all bg-white active:scale-95 uppercase"
                  >
                    + ADICIONAR MÓDULO EM {amb.tipo.toUpperCase()}
                  </button>
                </div>
              </div>
            ))}
            
            {(data.ambientes || []).length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-brand-text3">Volte ao passo anterior e adicione pelo menos um ambiente.</p>
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(2)} className="flex-1 bg-brand-surface2 border border-brand-border py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-brand-text3 uppercase tracking-widest whitespace-nowrap">
              <ChevronLeft size={18} /> Voltar
            </button>
            <button onClick={() => setStep(4)} className="flex-[1.5] bg-brand-red text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-brand-red/90 uppercase tracking-widest whitespace-nowrap shadow-lg shadow-brand-red/20">
              Próximo Passo <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest">Custos Internos 🔒</h3>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold leading-tight">
              O cliente verá apenas o valor final. Este detalhamento é privado.
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Materiais</label>
                <input 
                  type="number" 
                  value={data.v_mat || ''} 
                  onChange={e => updateData('v_mat', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Despesas</label>
                <input 
                  type="number" 
                  value={data.v_despesas || ''} 
                  onChange={e => updateData('v_despesas', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Ferragens</label>
                <input 
                  type="number" 
                  value={data.v_ferr || ''} 
                  onChange={e => updateData('v_ferr', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Outros</label>
                <input 
                  type="number" 
                  value={data.v_outros || ''} 
                  onChange={e => updateData('v_outros', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-widest ml-1">Margem de Lucro (%)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="number" 
                  value={data.v_margem || ''} 
                  onChange={e => updateData('v_margem', e.target.value)}
                  className="w-24 bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="30"
                />
                <div className="flex-1 bg-brand-surface2 p-3 rounded-xl border border-brand-border text-[10px] font-bold text-brand-text3 uppercase text-center">
                  Lucro: <span className="text-brand-red block text-base font-bold">{fmt(subtotal * ((Number(data.v_margem) || 0) / 100))}</span>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-brand-border">
              <div className="flex justify-between items-center mb-3 px-1">
                <span className="text-xs font-bold text-brand-text3 uppercase tracking-widest">Subtotal</span>
                <span className="text-base font-bold text-brand-text2">{fmt(subtotal)}</span>
              </div>
              <div className="bg-brand-red text-white p-6 rounded-[2rem] flex flex-col items-center gap-1 shadow-xl shadow-brand-red/20">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Valor Total Cliente</span>
                <span className="text-3xl font-bold">{fmt(total)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(3)} className="flex-1 bg-brand-surface2 border border-brand-border py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-brand-text3 uppercase tracking-widest whitespace-nowrap">
              <ChevronLeft size={18} /> Voltar
            </button>
            <button onClick={() => setStep(5)} className="flex-[1.5] bg-brand-red text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-brand-red/90 uppercase tracking-widest whitespace-nowrap shadow-lg shadow-brand-red/20">
              Próximo Passo <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest">Pagamento</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['Dinheiro', 'PIX', 'Cartão', 'Transferência', 'Cheque', 'Financiamento'].map(f => (
                <button 
                  key={f}
                  onClick={() => {
                    const current = data.pgto_formas || [];
                    const next = current.includes(f) ? current.filter((x: string) => x !== f) : [...current, f];
                    updateData('pgto_formas', next);
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-xs font-semibold transition-all uppercase tracking-tighter whitespace-nowrap overflow-hidden text-ellipsis",
                    (data.pgto_formas || []).includes(f) ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-text2 ml-1">Parcelas</label>
                  <select 
                    value={data.pgto_parcelas || 1}
                    onChange={e => updateData('pgto_parcelas', Number(e.target.value))}
                    className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-text2 ml-1">Juros</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateData('pgto_juros', false)}
                      className={cn(
                        "flex-1 py-4 rounded-xl border-2 text-xs font-semibold transition-all uppercase",
                        !data.pgto_juros ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      Sem
                    </button>
                    <button 
                      onClick={() => updateData('pgto_juros', true)}
                      className={cn(
                        "flex-1 py-4 rounded-xl border-2 text-xs font-semibold transition-all uppercase",
                        data.pgto_juros ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      Com
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-brand-text2 ml-1">Condição de Pagamento</label>
                <input 
                  type="text" 
                  value={data.pgto_condicao || ''} 
                  onChange={e => updateData('pgto_condicao', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="Ex: 50% entrada + 50% entrega"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-brand-text2 ml-1">Chave PIX</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['CPF', 'CNPJ', 'Celular', 'E-mail', 'Aleatória'].map(t => (
                    <button 
                      key={t}
                      onClick={() => updateData('pgto_pix_tipo', t)}
                      className={cn(
                        "py-3 rounded-xl border-2 text-[10px] font-semibold transition-all uppercase",
                        data.pgto_pix_tipo === t ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input 
                  type="text" 
                  value={data.pgto_pix || ''} 
                  onChange={e => updateData('pgto_pix', formatPixKey(e.target.value, data.pgto_pix_tipo || ''))}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder={
                    data.pgto_pix_tipo === 'CPF' ? '000.000.000-00' :
                    data.pgto_pix_tipo === 'CNPJ' ? '00.000.000/0000-00' :
                    data.pgto_pix_tipo === 'Celular' ? '(00) 00000-0000' :
                    'Chave PIX'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-brand-text2 ml-1">Observações Finais</label>
                <textarea 
                  value={data.obs_final || ''} 
                  onChange={e => updateData('obs_final', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-normal focus:bg-white focus:border-brand-red transition-all min-h-[100px] outline-none text-center"
                  placeholder="Informações adicionais para o cliente..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-brand-text2 ml-1">O que NÃO está incluso</label>
                <textarea 
                  value={data.excluso || ''} 
                  onChange={e => updateData('excluso', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-normal focus:bg-white focus:border-brand-red transition-all min-h-[100px] outline-none text-center"
                  placeholder="Ex: Pedras, cubas, eletros..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-brand-text2 ml-1">Validade do Orçamento</label>
                <input 
                  type="text" 
                  value={data.validade || ''} 
                  onChange={e => updateData('validade', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-normal focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="Ex: 10 dias"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(4)} className="flex-1 bg-brand-surface2 border-2 border-brand-border py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-brand-text3 uppercase tracking-widest whitespace-nowrap">
              <ChevronLeft size={18} /> Voltar
            </button>
            <button onClick={onSave} className="flex-[1.5] bg-brand-red text-white py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-brand-red/90 shadow-lg shadow-brand-red/20 uppercase tracking-widest whitespace-nowrap px-4">
              SALVAR E BAIXAR ORÇAMENTO <Check size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewPage({ proposta, profile, onBack, onStatusUpdate }: any) {
  const handleDownload = () => {
    if (profile) {
      generateProposalPDF(proposta, profile);
      if (onStatusUpdate && proposta.status !== 'enviada') {
        onStatusUpdate(proposta.id, 'enviada');
      }
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-text1">Proposta ✅</h2>
        <button onClick={onBack} className="text-brand-text3 p-2 active:scale-90 transition-transform"><X size={24} /></button>
      </div>

      <div className="bg-white border-2 border-brand-border rounded-[2.5rem] overflow-hidden shadow-lg">
        <div className="bg-brand-red p-8 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold uppercase tracking-tight">Orçamento</h3>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80 mt-1">
              #{String(proposta.numero).padStart(3, '0')} • {new Date(proposta.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3 min-w-[80px] flex items-center justify-center shadow-sm">
            {profile?.logo ? (
              <img src={profile.logo} className="max-h-8 object-contain" />
            ) : (
              <span className="text-brand-red text-xs font-bold uppercase tracking-widest">{profile?.nome?.substring(0, 5) || 'Fifty+'}</span>
            )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          <section className="space-y-3">
            <h4 className="text-[10px] font-bold text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Informações do Cliente</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-semibold text-brand-text3 uppercase">Nome</span>
              <span className="text-base font-semibold text-brand-text1 whitespace-nowrap overflow-hidden text-ellipsis ml-4">{proposta.cliente_nome}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-semibold text-brand-text3 uppercase">WhatsApp</span>
              <span className="text-base font-semibold text-brand-text1">{proposta.cliente_wpp}</span>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-bold text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Detalhes do Projeto</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-semibold text-brand-text3 uppercase">Ambientes</span>
              <span className="text-base font-semibold text-brand-text1">{(proposta.ambientes || []).length}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-semibold text-brand-text3 uppercase">Material</span>
              <span className="text-base font-semibold text-brand-text1">{proposta.chapa}</span>
            </div>
            {proposta.inicio && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-semibold text-brand-text3 uppercase">Início</span>
                <span className="text-base font-semibold text-brand-text1">{new Date(proposta.inicio).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
            {proposta.entrega && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-semibold text-brand-text3 uppercase">Entrega</span>
                <span className="text-base font-semibold text-brand-text1">{new Date(proposta.entrega).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-bold text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Condições de Pagamento</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-semibold text-brand-text3 uppercase">Parcelas</span>
              <span className="text-base font-semibold text-brand-text1">{proposta.pgto_parcelas || 1}x {proposta.pgto_juros ? 'c/ juros' : 's/ juros'}</span>
            </div>
            {proposta.pgto_pix && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-semibold text-brand-text3 uppercase">Chave PIX</span>
                <span className="text-base font-semibold text-brand-text1">{proposta.pgto_pix}</span>
              </div>
            )}
            {proposta.validade && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-semibold text-brand-text3 uppercase">Validade</span>
                <span className="text-base font-semibold text-brand-text1">{proposta.validade}</span>
              </div>
            )}
          </section>

          <div className="bg-brand-text1 text-white p-6 rounded-3xl flex flex-col items-center gap-1 shadow-xl shadow-brand-text1/20">
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] opacity-50">Investimento Total</span>
            <span className="text-4xl font-semibold text-brand-red">{fmt(proposta.v_total)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <button onClick={handleDownload} className="w-full bg-brand-red text-white py-6 rounded-2xl font-semibold text-xl flex items-center justify-center gap-3 shadow-lg shadow-brand-red/20 active:scale-95 transition-all uppercase px-4">
          <FileText size={24} strokeWidth={2.5} /> SALVAR E BAIXAR ORÇAMENTO
        </button>
        <button onClick={onBack} className="w-full bg-white border-2 border-brand-border py-5 rounded-2xl font-semibold text-base text-brand-text2 active:scale-95 transition-all uppercase">
          VOLTAR PARA LISTA
        </button>
      </div>
    </div>
  );
}

function ProfilePage({ profile, setProfile, userId, showToast, setCurrentPage, onSaveSuccess }: any) {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(!profile?.nome);

  const updateProfile = (key: string, val: any) => setProfile((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!profile?.user_name?.trim()) {
      showToast('Seu nome é obrigatório', 'error');
      return;
    }
    if (!profile?.nome?.trim()) {
      showToast('O nome da marcenaria é obrigatório', 'error');
      return;
    }
    if (!profile?.wpp?.trim()) {
      showToast('O WhatsApp é obrigatório', 'error');
      return;
    }

    setLoading(true);
    // Map 'user_name' and 'unidade_medida' to 'especialidade' as JSON to avoid DB column error
    const { user_name, unidade_medida, ...rest } = profile;
    const especialidadeJson = JSON.stringify({ user_name, unidade_medida });
    
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      ...rest,
      especialidade: especialidadeJson,
      updated_at: new Date().toISOString()
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Perfil salvo com sucesso!');
      setIsEditing(false);
      onSaveSuccess();
      // Redirect to tutorial (home) as requested
      setCurrentPage('tutorial');
    }
    setLoading(false);
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => updateProfile('logo', ev.target?.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Perfil</h2>
        <p className="text-xs text-brand-text3">Configurações da Marcenaria</p>
      </div>

      {!isEditing && profile?.nome ? (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-brand-border shadow-sm space-y-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-brand-surface2 rounded-3xl border-2 border-brand-border flex items-center justify-center overflow-hidden shrink-0">
              {profile.logo ? (
                <img src={profile.logo} className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-brand-red font-bold text-2xl">{profile.nome[0]}</span>
              )}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-brand-text1 leading-tight">{profile.nome}</h3>
              {profile.user_name && <p className="text-black font-bold text-sm uppercase tracking-wider">{profile.user_name}</p>}
              <p className="text-brand-text3 font-medium uppercase tracking-widest text-[10px] mt-1">{profile.cpf || 'CPF/CNPJ não informado'}</p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-brand-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-brand-red opacity-60"><MessageCircle size={18} /></div>
                <span className="text-xs font-bold text-brand-text3 uppercase tracking-wider">WhatsApp</span>
              </div>
              <span className="font-bold text-brand-text1">{profile.wpp}</span>
            </div>

            {profile.insta && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-brand-red opacity-60"><Settings size={18} /></div>
                  <span className="text-xs font-bold text-brand-text3 uppercase tracking-wider">Instagram</span>
                </div>
                <span className="font-bold text-brand-text1">{profile.insta}</span>
              </div>
            )}

            {profile.endereco && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="text-brand-red opacity-60"><Home size={18} /></div>
                  <span className="text-xs font-bold text-brand-text3 uppercase tracking-wider">Endereço</span>
                </div>
                <p className="text-sm font-medium text-brand-text2 pl-7 leading-relaxed">{profile.endereco}</p>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsEditing(true)}
            className="w-full bg-brand-surface2 border-2 border-brand-border text-brand-text2 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white hover:border-brand-red hover:text-brand-red transition-all active:scale-95 uppercase tracking-widest"
          >
            <Edit2 size={18} /> Editar Dados
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-brand-border space-y-8 shadow-sm">
            <h3 className="text-sm font-bold text-brand-red uppercase tracking-widest mb-2">Configurações e Dados</h3>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Unidade de Medida Padrão</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => updateProfile('unidade_medida', 'mm')}
                  className={cn(
                    "py-3 rounded-xl font-bold text-xs border-2 transition-all uppercase tracking-widest",
                    (profile?.unidade_medida || 'mm') === 'mm' ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                  )}
                >
                  Milímetros (mm)
                </button>
                <button 
                  onClick={() => updateProfile('unidade_medida', 'cm')}
                  className={cn(
                    "py-3 rounded-xl font-bold text-xs border-2 transition-all uppercase tracking-widest",
                    profile?.unidade_medida === 'cm' ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                  )}
                >
                  Centímetros (cm)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Seu Nome *</label>
              <input 
                type="text" 
                value={profile?.user_name || ''} 
                onChange={e => updateProfile('user_name', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="Como quer ser chamado?"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Nome da Marcenaria *</label>
              <input 
                type="text" 
                value={profile?.nome || ''} 
                onChange={e => updateProfile('nome', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="Ex: Marcenaria Silva"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">CNPJ ou CPF</label>
              <input 
                type="text" 
                value={profile?.cpf || ''} 
                onChange={e => updateProfile('cpf', formatCPFCNPJ(e.target.value))}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">WhatsApp *</label>
                <input 
                  type="tel" 
                  value={profile?.wpp || ''} 
                  onChange={e => updateProfile('wpp', formatPhone(e.target.value))}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Instagram</label>
                <input 
                  type="text" 
                  value={profile?.insta || ''} 
                  onChange={e => updateProfile('insta', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                  placeholder="@marcenaria"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Endereço Completo</label>
              <input 
                type="text" 
                value={profile?.endereco || ''} 
                onChange={e => updateProfile('endereco', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-semibold focus:bg-white focus:border-brand-red transition-all outline-none text-center"
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text3 uppercase tracking-wider ml-1">Logo da Empresa</label>
              <label className="w-full h-32 border-2 border-dashed border-brand-border rounded-2xl flex flex-col items-center justify-center text-brand-text3 cursor-pointer hover:border-brand-red hover:text-brand-red transition-all overflow-hidden bg-brand-surface2 shadow-inner relative">
                {profile?.logo ? (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <img src={profile.logo} className="max-w-full max-h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Camera size={24} className="text-white" />
                    </div>
                  </div>
                ) : (
                  <>
                    <Camera size={24} strokeWidth={2.5} />
                    <span className="text-[10px] font-bold mt-1 uppercase tracking-widest">Upload Logo</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleLogo} />
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => {
                if (profile?.nome) {
                  setIsEditing(false);
                } else {
                  setCurrentPage('tutorial');
                }
              }}
              className="flex-1 bg-white border-2 border-brand-border text-brand-text2 py-4 rounded-2xl font-bold text-sm active:scale-95 transition-all uppercase tracking-widest whitespace-nowrap"
            >
              {profile?.nome ? 'Cancelar' : 'Voltar'}
            </button>
            <button 
              onClick={handleSave} 
              disabled={loading}
              className="flex-[1.5] bg-brand-red text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-brand-red/20 uppercase tracking-widest whitespace-nowrap"
            >
              <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
