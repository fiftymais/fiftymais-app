import { jsPDF } from 'jspdf';
import { Proposta, Profile } from '../types';

export const generateProposalPDF = (proposta: Proposta, profile: Profile) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 20;
  const BLACK: [number, number, number] = [0, 0, 0];
  const GREY: [number, number, number] = [80, 80, 80];
  const LIGHT_GREY: [number, number, number] = [240, 240, 240];
  let y = 20;

  const fmt = (val: number) => 'R$ ' + (val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hoje = new Date(proposta.created_at || Date.now()).toLocaleDateString('pt-BR');

  // Extract data from 'medidas' if it's the new nested structure
  const m = (proposta.medidas && typeof proposta.medidas === 'object' && !Array.isArray(proposta.medidas)) ? proposta.medidas : null;
  const ambientes = proposta.ambientes || m?.ambientes || [];
  const pgto = m?.pgto || {
    formas: proposta.pgto_formas,
    parcelas: proposta.pgto_parcelas,
    juros: proposta.pgto_juros,
    pix: proposta.pgto_pix,
    condicao: proposta.pgto_condicao
  };
  const tech = m?.detalhes_tecnicos || {
    chapa: proposta.chapa,
    acabamento: proposta.acabamento,
    ferragens: proposta.ferragens,
    detalhes: proposta.detalhes,
    inicio: proposta.inicio,
    entrega: proposta.entrega,
    prazo_obs: proposta.prazo_obs,
    garantia: proposta.garantia,
    incluso: proposta.incluso,
    excluso: proposta.excluso,
    obs_final: proposta.obs_final
  };
  const cliente = m?.cliente || {
    endereco: proposta.cliente_end,
    referencia: proposta.cliente_ref
  };

  const chkPg = (n = 20) => {
    if (y + n > 280) {
      doc.addPage();
      y = 20;
    }
  };

  // --- LOGO ---
  if (profile.logo) {
    try {
      // Centralizar logo
      const imgW = 40;
      const imgH = 25;
      doc.addImage(profile.logo, 'JPEG', (W - imgW) / 2, y, imgW, imgH, '', 'FAST');
      y += imgH + 15;
    } catch (e) {
      console.error('Error adding logo to PDF', e);
      y += 10;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...BLACK);
    doc.text(profile.nome || 'Fifty+', W / 2, y, { align: 'center' });
    y += 20;
  }

  // --- TÍTULO ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BLACK);
  const title = "PROPOSTA DE ORÇAMENTO PARA MÓVEIS PLANEJADOS";
  const splitTitle = doc.splitTextToSize(title, W - M * 2);
  doc.text(splitTitle, M, y);
  y += (splitTitle.length * 8) + 4;

  // Linha horizontal
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 12;

  // --- DADOS DO CLIENTE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Cliente: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(proposta.cliente_nome || '—', M + 18, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Localização do Projeto: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(cliente.endereco || '—', M + 45, y);
  y += 7;

  if (tech.inicio || tech.entrega) {
    doc.setFont('helvetica', 'bold');
    doc.text('Cronograma da Montagem: ', M, y);
    doc.setFont('helvetica', 'normal');
    let crono = '';
    if (tech.inicio) crono += `Início: ${new Date(tech.inicio).toLocaleDateString('pt-BR')}`;
    if (tech.entrega) crono += `${tech.inicio ? ' | ' : ''}Entrega: ${new Date(tech.entrega).toLocaleDateString('pt-BR')}`;
    doc.text(crono, M + 48, y);
    y += 7;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Data da Proposta: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(hoje, M + 45, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Validade da Proposta: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text((profile.validade || 15) + ' dias', M + 45, y);
  y += 15;

  // --- DETALHAMENTO POR AMBIENTE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DETALHAMENTO POR AMBIENTE', M, y);
  y += 10;

  if (ambientes.length > 0) {
    ambientes.forEach((amb: any, idx: number) => {
      chkPg(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${idx + 1}. ${amb.tipo}`, M, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...GREY);
      
      (amb.pecas || []).forEach((p: any) => {
        chkPg(10);
        let pStr = `• ${p.nome || 'Peça'}: `;
        if (p.l || p.a || p.p) {
          pStr += `${p.l || '0'}m (L) x ${p.a || '0'}m (A) x ${p.p || '0'}m (P)`;
        }
        const splitP = doc.splitTextToSize(pStr, W - M * 2 - 5);
        doc.text(splitP, M + 5, y);
        y += splitP.length * 5;
      });

      if (amb.detalhes) {
        chkPg(10);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        const splitDet = doc.splitTextToSize(`Obs: ${amb.detalhes}`, W - M * 2 - 10);
        doc.text(splitDet, M + 5, y);
        y += splitDet.length * 4 + 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
      }

      y += 4;
      doc.setTextColor(...BLACK);
    });

    // Especificações Gerais
    chkPg(30);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('ESPECIFICAÇÕES GERAIS', M, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GREY);
    
  const specs = [];
  if (tech.chapa) specs.push(`Material: ${tech.chapa}`);
  if (tech.acabamento) specs.push(`Acabamento: ${tech.acabamento}`);
  if (tech.ferragens) specs.push(`Ferragens: ${tech.ferragens}`);
  if (tech.detalhes) specs.push(`Observações: ${tech.detalhes}`);

    specs.forEach(s => {
      const splitS = doc.splitTextToSize(s, W - M * 2);
      doc.text(splitS, M, y);
      y += splitS.length * 5;
    });
    y += 10;
    doc.setTextColor(...BLACK);
  }

  // --- SUMÁRIO DE INVESTIMENTO ---
  chkPg(40);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SUMÁRIO DE INVESTIMENTO', M, y);
  y += 8;

  doc.setFontSize(11);
  doc.text(`INVESTIMENTO TOTAL: ${fmt(proposta.v_total)}`, M, y);
  y += 15;

  // --- CONDIÇÕES COMERCIAIS ---
  chkPg(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CONDIÇÕES COMERCIAIS', M, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const condicoes = [];
  if (pgto.condicao) condicoes.push(`Condição: ${pgto.condicao}`);
  
  if (pgto.formas && pgto.formas.length > 0) {
    condicoes.push(`Formas de pagamento: ${pgto.formas.join(', ')}.`);
  }

  if (pgto.parcelas && pgto.parcelas > 1) {
    condicoes.push(`Parcelamento: ${pgto.parcelas}x ${pgto.juros ? 'com juros' : 'sem juros'}.`);
  }

  if (pgto.pix) {
    condicoes.push(`Chave PIX: ${pgto.pix}`);
  }

  if (tech.prazo_obs) condicoes.push(tech.prazo_obs);
  else condicoes.push(`Prazo estimado para entrega e instalação: a combinar.`);

  condicoes.forEach(c => {
    const splitC = doc.splitTextToSize(c, W - M * 2);
    doc.text(splitC, M, y);
    y += splitC.length * 5 + 4;
  });
  y += 10;

  // --- INFORMAÇÕES DA MARCENARIA ---
  chkPg(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('INFORMAÇÕES DA MARCENARIA', M, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(profile.nome || 'Fifty+', M, y);
  y += 5;
  if (profile.cpf) {
    doc.text(`CNPJ/CPF: ${profile.cpf}`, M, y);
    y += 5;
  }
  doc.text(`WhatsApp: ${profile.wpp || '—'}`, M, y);
  y += 5;
  if (profile.insta) {
    doc.text(`Instagram: ${profile.insta}`, M, y);
    y += 5;
  }
  if (profile.endereco) {
    const splitAddr = doc.splitTextToSize(`Endereço: ${profile.endereco}`, W - M * 2);
    doc.text(splitAddr, M, y);
    y += splitAddr.length * 5;
  }
  y += 15;

  // --- CONSIDERAÇÕES IMPORTANTES ---
  chkPg(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CONSIDERAÇÕES IMPORTANTES', M, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const exclusoText = tech.excluso || "Esta proposta não contempla itens como tampos de pedra, cubas, eletrodomésticos, instalações elétricas/hidráulicas ou quaisquer outros elementos não explicitamente mencionados.";
  const splitExcluso = doc.splitTextToSize(exclusoText, W - M * 2);
  doc.text(splitExcluso, M, y);
  y += splitExcluso.length * 5 + 20;

  // --- RODAPÉ FINAL ---
  chkPg(20);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.text('Agradecemos a oportunidade de apresentar esta proposta.', M, y);

  const nome = (proposta.cliente_nome || 'Cliente').replace(/\s/g, '_');
  doc.save(`Proposta_${nome}_${hoje.replace(/\//g, '-')}.pdf`);
};
