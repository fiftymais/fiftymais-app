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
  CheckCircle2,
  AlertCircle,
  Zap,
  ShieldCheck,
  Layout,
  Play,
  Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- UTILS ---
const fmt = (val: number) => 'R$ ' + (val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

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
  const [currentPage, setCurrentPage] = useState<'propostas' | 'orcamento' | 'perfil' | 'preview' | 'tutorial'>('tutorial');
  const [profile, setProfile] = useState<Profile | null>(null);
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
    ambientes: [{ id: '1', tipo: 'Cozinha Planejada', pecas: [] }],
    chapa: 'MDF 15mm',
    acabamento: 'Lacca Fosco',
    ferragens: 'Padrão',
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
    const clean = val.replace(/\D/g, '');
    switch (type) {
      case 'CPF':
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
      case 'CNPJ':
        return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
      case 'Celular':
        return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').slice(0, 15);
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

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
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
    <div className="min-h-screen bg-brand-bg pb-24">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-brand-border px-4 h-14 flex items-center justify-between">
        <button 
          onClick={() => setCurrentPage('tutorial')}
          className="text-xl font-bold text-brand-red tracking-tight hover:opacity-80 transition-opacity"
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

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {currentPage === 'tutorial' && (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <TutorialPage onStart={() => setCurrentPage('orcamento')} />
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
                <div />
                <button 
                  onClick={() => {
                    setEditingId(null);
                    setFormData({
                      ambientes: [{ id: '1', tipo: 'Cozinha Planejada', pecas: [] }],
                      chapa: 'MDF 15mm',
                      acabamento: 'Lacca Fosco',
                      ferragens: 'Padrão',
                      v_margem: 30,
                      status: 'nao_enviada',
                      pgto_formas: ['Dinheiro', 'PIX'],
                      pgto_parcelas: 1,
                      pgto_juros: false
                    });
                    setCurrentStep(1);
                    setCurrentPage('orcamento');
                  }}
                  className="bg-brand-red text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Plus size={18} /> Nova
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
                    className="w-full bg-white border-2 border-brand-border rounded-2xl pl-12 pr-4 py-4 text-base font-medium focus:border-brand-red transition-all outline-none shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {filteredPropostas.length === 0 ? (
                  <div className="py-16 text-center text-brand-text3 bg-white rounded-3xl border-2 border-brand-border border-dashed">
                    <FileText size={64} className="mx-auto mb-4 opacity-10" />
                    <p className="font-bold text-lg">Nenhuma proposta encontrada.</p>
                    <p className="text-sm opacity-60">Tente buscar por outro nome.</p>
                  </div>
                ) : (
                  filteredPropostas.map(p => (
                    <div key={p.id} className="bg-white border-2 border-brand-border rounded-3xl p-5 shadow-md hover:shadow-lg transition-all active:scale-[0.99]">
                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.2em]">
                            #{String(p.numero).padStart(3, '0')} • {new Date(p.created_at).toLocaleDateString()}
                          </p>
                          <h3 className="font-black text-xl text-brand-text1 leading-tight">{p.cliente_nome}</h3>
                          <p className="text-sm font-bold text-brand-red uppercase tracking-wider">{p.tipo_movel}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-brand-green text-xl">{fmt(p.v_total)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 pt-4 border-t-2 border-brand-border">
                        <button 
                          onClick={() => { setFormData(p); setCurrentPage('preview'); }}
                          className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-brand-surface2 text-brand-text2 hover:bg-brand-red/5 hover:text-brand-red transition-all active:scale-90"
                        >
                          <Eye size={22} strokeWidth={2.5} />
                          <span className="text-[11px] font-black uppercase tracking-widest">Ver</span>
                        </button>
                        <button 
                          onClick={() => {
                            setEditingId(p.id);
                            setFormData(p);
                            setCurrentStep(1);
                            setCurrentPage('orcamento');
                          }}
                          className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-brand-surface2 text-brand-text2 hover:bg-brand-red/5 hover:text-brand-red transition-all active:scale-90"
                        >
                          <Edit2 size={22} strokeWidth={2.5} />
                          <span className="text-[11px] font-black uppercase tracking-widest">Editar</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteProposta(p.id)}
                          className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 transition-all active:scale-90"
                        >
                          <Trash2 size={22} strokeWidth={2.5} />
                          <span className="text-[11px] font-black uppercase tracking-widest">Excluir</span>
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
                profile={profile} 
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-border h-18 sm:h-20 flex items-center justify-around px-1 sm:px-2 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setCurrentPage('tutorial')}
          className={cn(
            "flex flex-col items-center gap-1 px-2 py-1 sm:px-3 sm:py-2 rounded-2xl transition-all duration-300",
            currentPage === 'tutorial' ? "text-brand-red bg-brand-red/5 scale-105" : "text-brand-text3 hover:text-brand-text2"
          )}
        >
          <Home size={22} className="sm:w-6 sm:h-6" strokeWidth={currentPage === 'tutorial' ? 2.5 : 2} />
          <span className={cn("text-[10px] sm:text-[11px] uppercase tracking-tight font-black", currentPage === 'tutorial' ? "opacity-100" : "opacity-60")}>Início</span>
        </button>

        <button 
          onClick={() => setCurrentPage('perfil')}
          className={cn(
            "flex flex-col items-center gap-1 px-2 py-1 sm:px-3 sm:py-2 rounded-2xl transition-all duration-300",
            currentPage === 'perfil' ? "text-brand-red bg-brand-red/5 scale-105" : "text-brand-text3 hover:text-brand-text2"
          )}
        >
          <Settings size={22} className="sm:w-6 sm:h-6" strokeWidth={currentPage === 'perfil' ? 2.5 : 2} />
          <span className={cn("text-[10px] sm:text-[11px] uppercase tracking-tight font-black", currentPage === 'perfil' ? "opacity-100" : "opacity-60")}>Perfil</span>
        </button>

        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({
              ambientes: [{ id: '1', tipo: 'Cozinha Planejada', pecas: [] }],
              chapa: 'MDF 15mm',
              acabamento: 'Lacca Fosco',
              ferragens: 'Padrão',
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
            "flex flex-col items-center gap-1 px-2 py-1 sm:px-4 sm:py-2 rounded-2xl transition-all duration-300",
            currentPage === 'orcamento' ? "text-white bg-brand-red shadow-lg shadow-brand-red/20 scale-105" : "text-brand-red bg-brand-red/10 hover:bg-brand-red/20"
          )}
        >
          <Plus size={22} className="sm:w-6 sm:h-6" strokeWidth={3} />
          <span className="text-[10px] sm:text-[11px] uppercase tracking-tight font-black">Novo</span>
        </button>

        <button 
          onClick={() => setCurrentPage('propostas')}
          className={cn(
            "flex flex-col items-center gap-1 px-2 py-1 sm:px-3 sm:py-2 rounded-2xl transition-all duration-300",
            currentPage === 'propostas' ? "text-brand-red bg-brand-red/5 scale-105" : "text-brand-text3 hover:text-brand-text2"
          )}
        >
          <FileText size={22} className="sm:w-6 sm:h-6" strokeWidth={currentPage === 'propostas' ? 2.5 : 2} />
          <span className={cn("text-[10px] sm:text-[11px] uppercase tracking-tight font-black", currentPage === 'propostas' ? "opacity-100" : "opacity-60")}>Lista</span>
        </button>
      </nav>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function TutorialPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-12 py-8 max-w-4xl mx-auto">
      <div className="w-full relative aspect-video bg-zinc-100 rounded-[3rem] overflow-hidden border-4 border-brand-border shadow-2xl group cursor-pointer max-w-3xl mx-auto">
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90 group-hover:bg-zinc-900 transition-colors">
          <div className="text-white text-center p-8">
            <div className="w-24 h-24 bg-brand-red rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-brand-red/40 group-hover:scale-110 transition-transform">
              <Play size={48} fill="white" />
            </div>
            <p className="text-2xl font-black uppercase tracking-[0.2em]">Assistir Tutorial</p>
            <p className="text-sm font-bold opacity-60 mt-3 uppercase tracking-widest">Aprenda a usar em 2 minutos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {[
          { title: 'Rápido', desc: 'Crie orçamentos em minutos direto do celular.', icon: <Zap size={32} className="text-amber-500" /> },
          { title: 'Profissional', desc: 'PDFs elegantes com sua marca e fotos.', icon: <ShieldCheck size={32} className="text-emerald-500" /> },
          { title: 'Organizado', desc: 'Tenha o histórico de todos os seus clientes.', icon: <Layout size={32} className="text-blue-500" /> },
        ].map((item, i) => (
          <div key={i} className="bg-white p-10 rounded-[2.5rem] border-2 border-brand-border shadow-md hover:shadow-lg transition-all">
            <div className="w-16 h-16 bg-brand-surface2 rounded-3xl flex items-center justify-center mb-8 border-2 border-brand-border shadow-inner">
              {item.icon}
            </div>
            <h3 className="text-2xl font-black mb-3 text-brand-text1 uppercase tracking-tight">{item.title}</h3>
            <p className="text-brand-text2 font-bold leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
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
    if (error) showToast(error.message, 'error');
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
          <h1 className="text-4xl font-bold text-brand-red tracking-tighter mb-2">Fifty+</h1>
          <p className="text-zinc-500 text-sm">Propostas profissionais para marceneiros</p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">E-mail</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Senha</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <button 
              disabled={loading}
              className="w-full bg-brand-red text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-red-dark active:scale-[0.98] transition-all disabled:opacity-50"
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
          </form>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
             <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">E-mail cadastrado</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:border-brand-red focus:bg-white transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
            <button 
              disabled={loading}
              className="w-full bg-brand-red text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-red-dark active:scale-[0.98] transition-all disabled:opacity-50"
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

function OrcamentoForm({ step, setStep, data, setData, onSave, onCancel }: any) {
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
    const clean = val.replace(/\D/g, '');
    switch (type) {
      case 'CPF':
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
      case 'CNPJ':
        return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
      case 'Celular':
        return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').slice(0, 15);
      default:
        return val;
    }
  };

  const subtotal = (Number(data.v_mat) || 0) + (Number(data.v_despesas) || 0) + (Number(data.v_ferr) || 0) + (Number(data.v_outros) || 0);
  const total = subtotal + subtotal * ((Number(data.v_margem) || 0) / 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Nova Proposta</h2>
        <button onClick={onCancel} className="text-brand-text3"><X size={20} /></button>
      </div>

      {/* Steps Bar */}
      <div className="flex items-center gap-2 bg-white p-4 rounded-3xl border-2 border-brand-border overflow-x-auto no-scrollbar shadow-sm">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <button 
              onClick={() => setStep(i + 1)}
              className={cn(
                "flex flex-col items-center gap-1 shrink-0 min-w-[60px]",
                step === i + 1 ? "text-brand-red" : step > i + 1 ? "text-brand-green" : "text-brand-text3"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
                step === i + 1 ? "bg-brand-red text-white scale-110 shadow-md shadow-brand-red/20" : step > i + 1 ? "bg-brand-green text-white" : "bg-brand-border text-brand-text3"
              )}>
                {i + 1}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">{s}</span>
            </button>
            {i < steps.length - 1 && <div className="w-6 h-[2px] bg-brand-border shrink-0 mt-[-12px]" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-brand-border space-y-5">
            <h3 className="text-sm font-black text-brand-red uppercase tracking-widest mb-4">Dados do Cliente</h3>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">Nome Completo *</label>
              <input 
                type="text" 
                value={data.cliente_nome || ''} 
                onChange={e => updateData('cliente_nome', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">WhatsApp *</label>
              <input 
                type="tel" 
                value={data.cliente_wpp || ''} 
                onChange={e => updateData('cliente_wpp', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">Endereço da Obra</label>
              <input 
                type="text" 
                value={data.cliente_end || ''} 
                onChange={e => updateData('cliente_end', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="Rua, número, bairro"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Início Montagem</label>
                <input 
                  type="date" 
                  value={data.inicio || ''} 
                  onChange={e => updateData('inicio', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Previsão Entrega</label>
                <input 
                  type="date" 
                  value={data.entrega || ''} 
                  onChange={e => updateData('entrega', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                />
              </div>
            </div>
          </div>
          <button onClick={() => setStep(2)} className="w-full bg-brand-red text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 active:scale-95 transition-all">
            PRÓXIMO PASSO <ChevronRight size={22} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-brand-border space-y-6">
            <h3 className="text-sm font-black text-brand-red uppercase tracking-widest">Adicionar Ambientes</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Cozinha', emoji: '🍳', val: 'Cozinha Planejada' },
                { label: 'Guarda-Roupa', emoji: '🚪', val: 'Guarda-Roupa' },
                { label: 'Dorm. Casal', emoji: '🛏️', val: 'Dormitório Casal' },
                { label: 'Dorm. Solt.', emoji: '🛌', val: 'Dormitório Solteiro' },
                { label: 'Dorm. Inf.', emoji: '🧸', val: 'Dormitório Infantil' },
                { label: 'Amb. Criança', emoji: '👶', val: 'Ambiente de Criança' },
                { label: 'Home Office', emoji: '💻', val: 'Home Office' },
                { label: 'Escritório', emoji: '💼', val: 'Escritório' },
                { label: 'Recepção', emoji: '🛎️', val: 'Recepção' },
                { label: 'Closet', emoji: '👔', val: 'Closet' },
                { label: 'Banheiro', emoji: '🚿', val: 'Banheiro' },
                { label: 'Rack/Painel', emoji: '📺', val: 'Rack / Painel TV' },
                { label: 'Área Serviço', emoji: '🧺', val: 'Área de Serviço' },
                { label: 'Varanda', emoji: '🌿', val: 'Varanda' },
                { label: 'Área Ext.', emoji: '🌳', val: 'Área Externa' },
                { label: 'Sob Medida', emoji: '📐', val: 'Móvel Sob Medida' },
                { label: 'Personalizado', emoji: '✨', val: 'Ambiente Personalizado' },
              ].map(m => (
                <button 
                  key={m.val}
                  onClick={() => addAmbiente(m.val)}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-brand-border bg-brand-surface2 transition-all gap-2 hover:border-brand-red active:scale-95 shadow-sm"
                >
                  <span className="text-3xl">{m.emoji}</span>
                  <span className="text-[10px] font-black text-center leading-tight text-brand-text2 uppercase">
                    {m.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-brand-text3 uppercase tracking-widest">Ambientes Adicionados</h4>
              {(data.ambientes || []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-4 bg-brand-red-light rounded-2xl border-2 border-brand-red/20">
                  <span className="text-base font-black text-brand-red uppercase">{a.tipo}</span>
                  <button onClick={() => removeAmbiente(a.id)} className="text-brand-red p-1 active:scale-90 transition-transform"><X size={20} /></button>
                </div>
              ))}
              {(data.ambientes || []).length === 0 && <p className="text-sm text-brand-text3 italic">Nenhum ambiente adicionado.</p>}
            </div>

            <div className="space-y-5 pt-5 border-t-2 border-brand-border">
              <div className="space-y-2">
                <label className="text-sm font-black text-brand-text2 ml-1">Tipo de Chapa</label>
                <div className="flex flex-wrap gap-2">
                  {['MDF 15mm', 'MDF 18mm', 'MDP', 'Compensado'].map(c => (
                    <button 
                      key={c}
                      onClick={() => updateData('chapa', c)}
                      className={cn(
                        "px-5 py-3 rounded-xl text-xs font-black border-2 transition-all uppercase tracking-wider",
                        data.chapa === c ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-brand-text2 ml-1">Acabamento</label>
                <input 
                  type="text" 
                  value={data.acabamento || ''} 
                  onChange={e => updateData('acabamento', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="Ex: Lacca Fosco, Amadeirado..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-brand-text2 ml-1">Ferragens</label>
                <input 
                  type="text" 
                  value={data.ferragens || ''} 
                  onChange={e => updateData('ferragens', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="Ex: Amortecedores, Telescópicas..."
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 bg-white border-2 border-brand-border py-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all">
              <ChevronLeft size={22} /> VOLTAR
            </button>
            <button onClick={() => setStep(3)} className="flex-[2] bg-brand-red text-white py-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 active:scale-95 transition-all">
              PRÓXIMO <ChevronRight size={22} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-brand-border space-y-6">
            <h3 className="text-xs font-bold text-brand-red uppercase tracking-widest">Medidas por Ambiente</h3>
            
            {(data.ambientes || []).map((amb: any) => (
              <div key={amb.id} className="space-y-4 p-4 bg-brand-surface2 rounded-2xl border border-brand-border">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-brand-red">{amb.tipo}</h4>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-brand-text2 ml-1 uppercase tracking-wider">OBS: Material utilizado e detalhamento</label>
                  <textarea 
                    value={amb.detalhes || ''} 
                    onChange={e => updateAmbiente(amb.id, 'detalhes', e.target.value)}
                    className="w-full bg-white border-2 border-brand-border rounded-xl px-4 py-3 text-base focus:border-brand-red transition-all min-h-[80px] outline-none"
                    placeholder="Cores, puxadores, especificações para este ambiente..."
                  />
                </div>
                
                <div className="space-y-4">
                  {amb.pecas.map((p: any, pIdx: number) => (
                    <div key={pIdx} className="bg-white p-4 rounded-2xl border-2 border-brand-border space-y-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <input 
                          type="text" 
                          value={p.nome} 
                          onChange={e => updatePeca(amb.id, pIdx, 'nome', e.target.value)}
                          className="flex-1 bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-brand-red transition-all"
                          placeholder="Módulo/item"
                        />
                        <button onClick={() => removePeca(amb.id, pIdx)} className="text-red-500 p-2 active:scale-90 transition-transform"><Trash2 size={20} /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-brand-text3 uppercase ml-1">Largura</label>
                          <input 
                            type="number" 
                            value={p.l} 
                            onChange={e => updatePeca(amb.id, pIdx, 'l', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-3 py-3 text-base font-bold outline-none focus:border-brand-red transition-all"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-brand-text3 uppercase ml-1">Altura</label>
                          <input 
                            type="number" 
                            value={p.a} 
                            onChange={e => updatePeca(amb.id, pIdx, 'a', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-3 py-3 text-base font-bold outline-none focus:border-brand-red transition-all"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-brand-text3 uppercase ml-1">Prof.</label>
                          <input 
                            type="number" 
                            value={p.p} 
                            onChange={e => updatePeca(amb.id, pIdx, 'p', e.target.value)}
                            className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-3 py-3 text-base font-bold outline-none focus:border-brand-red transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => addPeca(amb.id)}
                    className="w-full py-4 border-2 border-dashed border-brand-border rounded-2xl text-brand-text3 font-black text-xs hover:border-brand-red hover:text-brand-red transition-all bg-white active:scale-95"
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
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 bg-white border border-brand-border py-4 rounded-2xl font-bold flex items-center justify-center gap-2">
              <ChevronLeft size={18} /> Voltar
            </button>
            <button onClick={() => setStep(4)} className="flex-[2] bg-brand-red text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2">
              Próximo <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-brand-border space-y-5">
            <h3 className="text-sm font-black text-brand-red uppercase tracking-widest">Custos Internos 🔒</h3>
            <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl text-xs text-amber-800 font-bold leading-relaxed">
              O cliente verá apenas o valor final. Este detalhamento é privado para você.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Materiais (R$)</label>
                <input 
                  type="number" 
                  value={data.v_mat || ''} 
                  onChange={e => updateData('v_mat', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Despesas (R$)</label>
                <input 
                  type="number" 
                  value={data.v_despesas || ''} 
                  onChange={e => updateData('v_despesas', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="Frete, ajuda..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">Margem de Lucro (%)</label>
              <div className="flex items-center gap-3">
                <input 
                  type="number" 
                  value={data.v_margem || ''} 
                  onChange={e => updateData('v_margem', e.target.value)}
                  className="w-28 bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="30"
                />
                <div className="flex-1 bg-brand-surface2 p-4 rounded-xl border-2 border-brand-border text-xs font-black text-brand-text3 uppercase text-center">
                  Lucro: <span className="text-brand-red block text-base">{fmt(subtotal * ((Number(data.v_margem) || 0) / 100))}</span>
                </div>
              </div>
            </div>
            <div className="pt-5 border-t-2 border-brand-border">
              <div className="flex justify-between items-center mb-3 px-1">
                <span className="text-xs font-black text-brand-text3 uppercase tracking-widest">Subtotal de Custos</span>
                <span className="text-base font-black text-brand-text2">{fmt(subtotal)}</span>
              </div>
              <div className="bg-brand-red text-white p-5 rounded-3xl flex flex-col items-center gap-1 shadow-lg shadow-brand-red/20">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Valor Total para o Cliente</span>
                <span className="text-3xl font-black">{fmt(total)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 bg-white border-2 border-brand-border py-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all">
              <ChevronLeft size={22} /> VOLTAR
            </button>
            <button onClick={() => setStep(5)} className="flex-[2] bg-brand-red text-white py-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 active:scale-95 transition-all">
              PRÓXIMO <ChevronRight size={22} />
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-brand-border space-y-6">
            <h3 className="text-sm font-black text-brand-red uppercase tracking-widest">Pagamento</h3>
            <div className="grid grid-cols-3 gap-3">
              {['Dinheiro', 'PIX', 'Cartão', 'Transferência', 'Cheque', 'Financiamento'].map(f => (
                <button 
                  key={f}
                  onClick={() => {
                    const current = data.pgto_formas || [];
                    const next = current.includes(f) ? current.filter((x: string) => x !== f) : [...current, f];
                    updateData('pgto_formas', next);
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-[11px] font-black transition-all uppercase tracking-tighter",
                    (data.pgto_formas || []).includes(f) ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-black text-brand-text2 ml-1">Parcelas</label>
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
                <div className="space-y-1.5">
                  <label className="text-sm font-black text-brand-text2 ml-1">Juros</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateData('pgto_juros', false)}
                      className={cn(
                        "flex-1 py-4 rounded-xl border-2 text-[10px] font-black transition-all uppercase",
                        !data.pgto_juros ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      Sem
                    </button>
                    <button 
                      onClick={() => updateData('pgto_juros', true)}
                      className={cn(
                        "flex-1 py-4 rounded-xl border-2 text-[10px] font-black transition-all uppercase",
                        data.pgto_juros ? "border-brand-red bg-brand-red-light text-brand-red shadow-sm" : "border-brand-border bg-brand-surface2 text-brand-text2"
                      )}
                    >
                      Com
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Condição de Pagamento</label>
                <input 
                  type="text" 
                  value={data.pgto_condicao || ''} 
                  onChange={e => updateData('pgto_condicao', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="Ex: 50% entrada + 50% entrega"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-brand-text2 ml-1">Chave PIX</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['CPF', 'CNPJ', 'Celular', 'E-mail', 'Aleatória'].map(t => (
                    <button 
                      key={t}
                      onClick={() => updateData('pgto_pix_tipo', t)}
                      className={cn(
                        "py-3 rounded-xl border-2 text-[10px] font-black transition-all uppercase",
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
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder={
                    data.pgto_pix_tipo === 'CPF' ? '000.000.000-00' :
                    data.pgto_pix_tipo === 'CNPJ' ? '00.000.000/0000-00' :
                    data.pgto_pix_tipo === 'Celular' ? '(00) 00000-0000' :
                    'Chave PIX'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Observações Finais</label>
                <textarea 
                  value={data.obs_final || ''} 
                  onChange={e => updateData('obs_final', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all min-h-[100px] outline-none"
                  placeholder="Informações adicionais para o cliente..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">O que NÃO está incluso</label>
                <textarea 
                  value={data.excluso || ''} 
                  onChange={e => updateData('excluso', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-medium focus:bg-white focus:border-brand-red transition-all min-h-[100px] outline-none"
                  placeholder="Ex: Pedras, cubas, eletros..."
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="flex-1 bg-white border-2 border-brand-border py-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all">
              <ChevronLeft size={22} /> VOLTAR
            </button>
            <button onClick={onSave} className="flex-[2] bg-brand-green text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 active:scale-95 transition-all">
              <Plus size={22} /> ENVIAR PROPOSTA
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
        <h2 className="text-2xl font-black text-brand-text1">Proposta ✅</h2>
        <button onClick={onBack} className="text-brand-text3 p-2 active:scale-90 transition-transform"><X size={24} /></button>
      </div>

      <div className="bg-white border-2 border-brand-border rounded-[2.5rem] overflow-hidden shadow-lg">
        <div className="bg-brand-red p-8 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Orçamento</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mt-1">
              #{String(proposta.numero).padStart(3, '0')} • {new Date(proposta.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3 min-w-[80px] flex items-center justify-center shadow-sm">
            {profile?.logo ? (
              <img src={profile.logo} className="max-h-8 object-contain" />
            ) : (
              <span className="text-brand-red text-xs font-black uppercase tracking-widest">{profile?.nome?.substring(0, 5) || 'Fifty+'}</span>
            )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Informações do Cliente</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-black text-brand-text3 uppercase">Nome</span>
              <span className="text-base font-black text-brand-text1">{proposta.cliente_nome}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-black text-brand-text3 uppercase">WhatsApp</span>
              <span className="text-base font-black text-brand-text1">{proposta.cliente_wpp}</span>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Detalhes do Projeto</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-black text-brand-text3 uppercase">Ambientes</span>
              <span className="text-base font-black text-brand-text1">{(proposta.ambientes || []).length}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-black text-brand-text3 uppercase">Material</span>
              <span className="text-base font-black text-brand-text1">{proposta.chapa}</span>
            </div>
            {proposta.inicio && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-black text-brand-text3 uppercase">Início</span>
                <span className="text-base font-black text-brand-text1">{new Date(proposta.inicio).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
            {proposta.entrega && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-black text-brand-text3 uppercase">Entrega</span>
                <span className="text-base font-black text-brand-text1">{new Date(proposta.entrega).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.3em] border-b-2 border-brand-border pb-2">Condições de Pagamento</h4>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-black text-brand-text3 uppercase">Parcelas</span>
              <span className="text-base font-black text-brand-text1">{proposta.pgto_parcelas || 1}x {proposta.pgto_juros ? 'c/ juros' : 's/ juros'}</span>
            </div>
            {proposta.pgto_pix && (
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-black text-brand-text3 uppercase">Chave PIX</span>
                <span className="text-base font-black text-brand-text1">{proposta.pgto_pix}</span>
              </div>
            )}
          </section>

          <div className="bg-brand-text1 text-white p-6 rounded-3xl flex flex-col items-center gap-1 shadow-xl shadow-brand-text1/20">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Investimento Total</span>
            <span className="text-4xl font-black text-brand-red">{fmt(proposta.v_total)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <button onClick={handleDownload} className="w-full bg-brand-red text-white py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-lg shadow-brand-red/20 active:scale-95 transition-all uppercase">
          <FileText size={24} strokeWidth={2.5} /> BAIXAR PDF
        </button>
        <button onClick={onBack} className="w-full bg-white border-2 border-brand-border py-5 rounded-2xl font-black text-base text-brand-text2 active:scale-95 transition-all uppercase">
          VOLTAR PARA LISTA
        </button>
      </div>
    </div>
  );
}

function ProfilePage({ profile, setProfile, userId, showToast }: any) {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(!profile?.nome);

  const updateProfile = (key: string, val: any) => setProfile((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      ...profile,
      updated_at: new Date().toISOString()
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Perfil salvo com sucesso!');
      setIsEditing(false);
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
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-brand-border shadow-md space-y-8">
          <div className="flex flex-col items-center text-center space-y-5">
            <div className="w-32 h-32 bg-brand-surface2 rounded-[2rem] border-2 border-brand-border flex items-center justify-center overflow-hidden shadow-inner">
              {profile.logo ? (
                <img src={profile.logo} className="w-full h-full object-contain p-3" />
              ) : (
                <span className="text-brand-red font-black text-4xl">{profile.nome[0]}</span>
              )}
            </div>
            <div>
              <h3 className="text-3xl font-black text-brand-text1 leading-tight">{profile.nome}</h3>
              <p className="text-brand-text3 font-black uppercase tracking-widest text-xs mt-1">{profile.cpf || 'CPF/CNPJ não informado'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-5 p-5 bg-brand-surface2 rounded-3xl border-2 border-brand-border shadow-sm">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-red shadow-sm border border-brand-border">
                <MessageCircle size={24} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.2em]">WhatsApp</p>
                <p className="font-black text-lg text-brand-text1">{profile.wpp}</p>
              </div>
            </div>
            {profile.insta && (
              <div className="flex items-center gap-5 p-5 bg-brand-surface2 rounded-3xl border-2 border-brand-border shadow-sm">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-red shadow-sm border border-brand-border">
                  <Settings size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.2em]">Instagram</p>
                  <p className="font-black text-lg text-brand-text1">{profile.insta}</p>
                </div>
              </div>
            )}
            {profile.endereco && (
              <div className="flex items-center gap-5 p-5 bg-brand-surface2 rounded-3xl border-2 border-brand-border shadow-sm">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-red shadow-sm border border-brand-border">
                  <Home size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-brand-text3 uppercase tracking-[0.2em]">Endereço</p>
                  <p className="font-black text-base text-brand-text1 leading-tight">{profile.endereco}</p>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsEditing(true)}
            className="w-full bg-brand-red text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 active:scale-95 transition-all"
          >
            <Edit2 size={22} /> EDITAR PERFIL
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-brand-border space-y-6 shadow-sm">
            <h3 className="text-sm font-black text-brand-red uppercase tracking-widest mb-4">Dados da Empresa</h3>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">Nome da Marcenaria *</label>
              <input 
                type="text" 
                value={profile?.nome || ''} 
                onChange={e => updateProfile('nome', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="Ex: Marcenaria Silva"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">CNPJ ou CPF</label>
              <input 
                type="text" 
                value={profile?.cpf || ''} 
                onChange={e => updateProfile('cpf', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">WhatsApp *</label>
                <input 
                  type="tel" 
                  value={profile?.wpp || ''} 
                  onChange={e => updateProfile('wpp', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-black text-brand-text2 ml-1">Instagram</label>
                <input 
                  type="text" 
                  value={profile?.insta || ''} 
                  onChange={e => updateProfile('insta', e.target.value)}
                  className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                  placeholder="@marcenaria"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-black text-brand-text2 ml-1">Endereço Completo</label>
              <input 
                type="text" 
                value={profile?.endereco || ''} 
                onChange={e => updateProfile('endereco', e.target.value)}
                className="w-full bg-brand-surface2 border-2 border-brand-border rounded-xl px-4 py-4 text-base font-bold focus:bg-white focus:border-brand-red transition-all outline-none"
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-black text-brand-text2 ml-1">Logo da Empresa</label>
              <label className="w-full h-40 border-2 border-dashed border-brand-border rounded-3xl flex flex-col items-center justify-center text-brand-text3 cursor-pointer hover:border-brand-red hover:text-brand-red transition-all overflow-hidden bg-brand-surface2 shadow-inner">
                {profile?.logo ? (
                  <img src={profile.logo} className="w-full h-full object-contain p-4" />
                ) : (
                  <>
                    <Camera size={32} strokeWidth={2.5} />
                    <span className="text-xs font-black mt-3 uppercase tracking-widest">Upload Logo</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleLogo} />
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            {profile?.nome && (
              <button 
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-white border-2 border-brand-border text-brand-text2 py-5 rounded-2xl font-black text-base active:scale-95 transition-all uppercase"
              >
                Cancelar
              </button>
            )}
            <button 
              onClick={handleSave} 
              disabled={loading}
              className="flex-[2] bg-brand-red text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-brand-red/20 uppercase"
            >
              <Save size={22} /> {loading ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
