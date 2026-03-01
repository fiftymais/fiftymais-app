import { jsPDF } from 'jspdf';
import { Proposta, Profile } from '../types';

export const generateProposalPDF = (proposta: Proposta, profile: Profile) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 15;
  const BLACK: [number, number, number] = [0, 0, 0];
  const GREY: [number, number, number] = [80, 80, 80];
  let y = 20;

  const fmt = (val: number) => 'R$ ' + (val || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hoje = new Date(proposta.created_at || Date.now()).toLocaleDateString('pt-BR');

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
    validade: proposta.validade,
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

  const lineSpacing = 7;
  const sectionSpacing = 10;

  // --- LOGO ---
  if (profile.logo) {
    try {
      const imgW = 40;
      const imgH = 25;
      doc.addImage(profile.logo, 'JPEG', (W - imgW) / 2, y, imgW, imgH, '', 'FAST');
      y += imgH + 12;
    } catch (e) {
      y += 10;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(profile.nome || 'Fifty+', W / 2, y, { align: 'center' });
    y += 15;
  }

  // --- TÍTULO ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const title = "PROPOSTA DE ORÇAMENTO PARA MÓVEIS PLANEJADOS";
  const splitTitle = doc.splitTextToSize(title, W - M * 2);
  doc.text(splitTitle, M, y);
  y += (splitTitle.length * 7) + 2;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += sectionSpacing;

  // --- DADOS DO CLIENTE ---
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text((proposta.cliente_nome || '—').toUpperCase(), M + 20, y);
  y += lineSpacing;

  doc.setFont('helvetica', 'bold');
  doc.text('LOCAL: ', M, y);
  doc.setFont('helvetica', 'normal');
  const addr = cliente.endereco || '—';
  const splitAddr = doc.splitTextToSize(addr, W - M - 35);
  doc.text(splitAddr, M + 15, y);
  y += (splitAddr.length * 5) + 2;

  doc.setFont('helvetica', 'bold');
  doc.text('DATA: ', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(hoje, M + 15, y);
  y += lineSpacing;

  if (tech.validade) {
    doc.setFont('helvetica', 'bold');
    doc.text('VALIDADE: ', M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(tech.validade, M + 22, y);
    y += sectionSpacing;
  } else {
    y += 5;
  }

  // --- DETALHAMENTO ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DETALHAMENTO DO PROJETO', M, y);
  y += 7;

  if (ambientes.length > 0) {
    ambientes.forEach((amb: any, idx: number) => {
      chkPg(25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${idx + 1}. ${amb.tipo.toUpperCase()}`, M, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GREY);
      
      (amb.pecas || []).forEach((p: any) => {
        chkPg(8);
        let pStr = `• ${p.nome || 'Peça'}: `;
        if (p.l || p.a || p.p) {
          pStr += `${p.l || '0'}m (L) x ${p.a || '0'}m (A) x ${p.p || '0'}m (P)`;
        }
        const splitP = doc.splitTextToSize(pStr, W - M * 2 - 8);
        doc.text(splitP, M + 5, y);
        y += splitP.length * 5;
      });

      if (amb.detalhes) {
        chkPg(8);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        const splitDet = doc.splitTextToSize(`Obs: ${amb.detalhes}`, W - M * 2 - 10);
        doc.text(splitDet, M + 5, y);
        y += splitDet.length * 4 + 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }
      y += 3;
      doc.setTextColor(...BLACK);
    });
  }

  // Especificações Técnicas
  chkPg(30);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ESPECIFICAÇÕES TÉCNICAS', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  
  const specs = [];
  if (tech.chapa) specs.push(`Material: ${tech.chapa}`);
  if (tech.acabamento) specs.push(`Acabamento: ${tech.acabamento}`);
  if (tech.ferragens) specs.push(`Ferragens: ${tech.ferragens}`);
  if (tech.detalhes) specs.push(`Observações: ${tech.detalhes}`);

  specs.forEach(s => {
    chkPg(8);
    const splitS = doc.splitTextToSize(s, W - M * 2);
    doc.text(splitS, M, y);
    y += splitS.length * 5;
  });
  y += sectionSpacing;
  doc.setTextColor(...BLACK);

  // --- INVESTIMENTO ---
  chkPg(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('INVESTIMENTO TOTAL', M, y);
  y += 7;
  doc.setFontSize(12);
  doc.text(`${fmt(proposta.v_total)}`, M, y);
  y += sectionSpacing;

  // --- PAGAMENTO ---
  chkPg(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CONDIÇÕES DE PAGAMENTO', M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const condicoes = [];
  if (pgto.condicao) condicoes.push(`Condição: ${pgto.condicao}`);
  if (pgto.formas?.length) condicoes.push(`Formas: ${pgto.formas.join(', ')}.`);
  if (pgto.parcelas > 1) condicoes.push(`Parcelamento: ${pgto.parcelas}x ${pgto.juros ? 'com juros' : 'sem juros'}.`);
  if (pgto.pix) condicoes.push(`PIX: ${pgto.pix}`);
  if (tech.prazo_obs) condicoes.push(`Prazo: ${tech.prazo_obs}`);

  condicoes.forEach(c => {
    chkPg(8);
    const splitC = doc.splitTextToSize(c, W - M * 2);
    doc.text(splitC, M, y);
    y += splitC.length * 5 + 1;
  });
  y += sectionSpacing;

  // --- MARCENARIA ---
  chkPg(40);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO FORNECEDOR', M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(profile.nome || 'Fifty+', M, y);
  y += 5;
  if (profile.cpf) { doc.text(`CNPJ/CPF: ${profile.cpf}`, M, y); y += 5; }
  doc.text(`WhatsApp: ${profile.wpp || '—'}`, M, y);
  y += 5;
  if (profile.insta) { doc.text(`Instagram: ${profile.insta}`, M, y); y += 5; }
  y += sectionSpacing;

  // --- IMPORTANTES ---
  chkPg(30);
  doc.setFont('helvetica', 'bold');
  doc.text('CONSIDERAÇÕES IMPORTANTES', M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  const exclusoText = tech.excluso || "Não contempla itens não mencionados.";
  const splitExcluso = doc.splitTextToSize(exclusoText, W - M * 2);
  doc.text(splitExcluso, M, y);
  y += splitExcluso.length * 5 + 15;

  const sanitizedNome = (proposta.cliente_nome || 'Cliente').trim().replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const filename = `Proposta_${sanitizedNome}_${hoje.replace(/\//g, '-')}.pdf`;

  const pdfBlob = doc.output('blob');
  const file = new File([pdfBlob], filename, { type: 'application/pdf' });

  // Tenta usar a API de Compartilhamento Nativa (Melhor para Mobile/WhatsApp)
  // Isso envia o ARQUIVO diretamente, sem o link "blob:"
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: `Orçamento - ${proposta.cliente_nome}`,
      text: `Segue a proposta de orçamento para ${proposta.cliente_nome}.`,
    }).catch(() => {
      // Se o usuário cancelar ou der erro, faz o download normal
      doc.save(filename);
    });
  } else {
    // Fallback para Desktop ou navegadores que não suportam Share API
    doc.save(filename);
  }
};
