/* Akilli Muhasebe 1.0 — app_documents.js */
/* ---- Document capture: receipts, e-invoices, POS slips and delivery notes ---- */
function documentTypeName(type){
  return ({receipt:'Market / perakende fişi',einvoice:'e-Fatura / e-Arşiv',
    invoice:'Diğer fatura',delivery_note:'İrsaliye',pos:'POS slipi',
    unknown:'Diğer belge'})[type]||'Belge';
}
function ocrInput(label,id,value,type){
  type=type||'text';
  const numeric=type==='number'?' inputmode="decimal" step="any"':'';
  return '<div class="field"><label>'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value==null?'':value)+'"'+numeric+'></div>';
}
function renderOcrReview(){
  if(!pendingOcr)return;
  const d=pendingOcr;
  const typeOptions=['receipt','einvoice','delivery_note','pos','invoice','unknown']
    .map(t=>'<option value="'+t+'"'+(d.documentType===t?' selected':'')+'>'+documentTypeName(t)+'</option>').join('');
  const warnings=(d.warnings||[]).map(w=>'<div class="muted">⚠ '+esc(w)+'</div>').join('');
  $('ocrSummary').innerHTML='<b>'+esc(documentTypeName(d.documentType))+'</b> • '+(d.items||[]).length+
    ' ürün/hizmet satırı<br><b>Genel toplam:</b> '+(d.total==null?'Belirsiz':money(d.total))+
    '<br><b>Satır toplamı:</b> '+money(d.itemSum||0)+
    (warnings?'<div style="margin-top:9px">'+warnings+'</div>':'');
  $('ocrReview').innerHTML='<div class="section"><h2>Okunan alanları kontrol et</h2></div>'+
    '<div class="formgrid"><div class="field"><label>Belge türü (düzenlenebilir)</label><select id="ocrDocumentType" onchange="updateOcrTypeControls()">'+typeOptions+'</select></div>'+
    ocrInput('Firma / satıcı adı','ocrParty',d.party)+
    ocrInput('Fiş / fatura / irsaliye numarası','ocrNumber',d.number)+
    ocrInput('Tarih','ocrDate',d.date,'date')+
    ocrInput('Saat','ocrTime',d.time)+
    ocrInput('Vergi numarası / TCKN','ocrTaxNo',d.taxNo)+
    ocrInput('Genel toplam (TL)','ocrTotal',d.total,'number')+
    ocrInput('KDV (TL) (varsa)','ocrVat',d.vat,'number')+
    ocrInput('KDV oranı (%) (varsa)','ocrVatRate',d.vatRate,'number')+
    ocrInput('KDV hariç (TL) (varsa)','ocrNet',d.net,'number')+
    '<div class="field"><label>Ödeme yöntemi</label><select id="ocrPayment"><option value="unknown">Belirsiz</option><option value="cash">Nakit</option><option value="card">Kart / POS</option><option value="transfer">Havale</option></select></div></div>'+
    '<div class="section"><h2>Ürün / hizmet kalemleri</h2><button onclick="addOcrItem()">+ Ürün ekle</button></div>'+
    '<div class="muted">Miktar, birim fiyat ve tutarı karşılaştır. El yazısı notları otomatik onaylama.</div>'+
    '<div id="ocrItemRows"></div>';
  $('ocrPayment').value=d.payment||'unknown';
  renderOcrItems();
  updateOcrTypeControls();
}
function updateOcrTypeControls(){
  const t=$('ocrDocumentType')?.value;
  $('ocrUseButton')?.classList.toggle('hidden',!['einvoice','invoice'].includes(t));
}
function renderOcrItems(){
  if(!$('ocrItemRows'))return;
  const items=pendingOcr?.items||[];
  $('ocrItemRows').innerHTML=items.map((x,i)=>
    '<div class="panel" style="margin:8px 0;padding:11px" data-document-item="'+i+'">'+
    '<div class="toprow"><b>Satır '+(i+1)+'</b><button class="tag" onclick="removeOcrItem('+i+')">Sil</button></div>'+
    '<div class="formgrid" style="margin-top:8px">'+
    documentItemInput(i,'code','Ürün kodu',x.code)+
    documentItemInput(i,'name','Ürün / hizmet adı',x.name)+
    documentItemInput(i,'quantity','Miktar',x.quantity)+
    documentItemInput(i,'unit','Birim',x.unit)+
    documentItemInput(i,'unitPrice','Birim fiyatı (TL)',x.unitPrice)+
    documentItemInput(i,'amount','Satır toplamı (TL)',x.amount)+
    documentItemInput(i,'vatRate','KDV oranı (varsa)',x.vatRate)+
    '</div></div>').join('')||
    '<div class="notice">OCR ürün satırı çıkaramadı. “Ürün ekle” ile bilgileri elle girebilirsin.</div>';
}
function documentItemInput(index,field,label,value){
  const isNumeric=['quantity','unitPrice','amount','vatRate'].includes(field);
  return '<div class="field"><label>'+esc(label)+'</label>'+
    '<input data-document-field="'+field+'" data-index="'+index+'" value="'+esc(value==null?'':value)+'"'+
    (isNumeric?' type="text" inputmode="decimal"':' type="text"')+'></div>';
}
function readOcrItems(){
  const rows=$('ocrItemRows')?.querySelectorAll('[data-document-item]')||[];
  const items=[];
  for(const element of rows){
    const get=field=>element.querySelector('[data-document-field="'+field+'"]')?.value?.trim()||'';
    const name=get('name'),quantity=DocumentParser.number(get('quantity'));
    const unitPrice=DocumentParser.number(get('unitPrice')),amount=DocumentParser.number(get('amount'));
    const vatRateText=get('vatRate');
    if(!name&&!get('code'))continue;
    items.push({name:name.slice(0,180),code:get('code').slice(0,40),quantity:Number.isFinite(quantity)?quantity:0,
      unit:get('unit').slice(0,32),unitPrice:Number.isFinite(unitPrice)?unitPrice:0,
      amount:Number.isFinite(amount)?amount:0,
      vatRate:vatRateText!==''&&Number.isFinite(DocumentParser.number(vatRateText))?
        DocumentParser.number(vatRateText):null});
  }
  return items.slice(0,120);
}
function addOcrItem(){
  if(!pendingOcr)return;
  pendingOcr.items=readOcrItems();
  if(pendingOcr.items.length>=120)return NativeStore.showMessage('En fazla 120 satır eklenebilir.');
  pendingOcr.items.push({code:'',name:'',quantity:1,unit:'ADET',unitPrice:0,amount:0,vatRate:null});
  renderOcrItems();
}
function removeOcrItem(index){
  if(!pendingOcr)return;
  const items=readOcrItems();
  items.splice(index,1);
  pendingOcr.items=items;renderOcrItems();
}
function readReviewedDocument(){
  if(!pendingOcr)throw new Error('Belge bulunamadı.');
  const value=id=>$(id)?.value?.trim()||'';
  const numerical=id=>{const raw=value(id);return raw===''?null:DocumentParser.number(raw);};
  return {...pendingOcr,
    documentType:value('ocrDocumentType'),party:value('ocrParty').slice(0,140),
    number:value('ocrNumber').slice(0,80),date:value('ocrDate'),
    time:value('ocrTime').slice(0,16),taxNo:value('ocrTaxNo').slice(0,16),
    total:numerical('ocrTotal'),net:numerical('ocrNet'),vat:numerical('ocrVat'),
    vatRate:numerical('ocrVatRate'),payment:value('ocrPayment'),items:readOcrItems(),verified:true};
}
function validateReviewedDocument(d){
  if(!d||!['receipt','einvoice','delivery_note','pos','invoice','unknown'].includes(d.documentType))return 'Belge türünü seç.';
  if(d.total!==null&&(!Number.isFinite(d.total)||d.total<0))return 'Geçerli genel toplam gir.';
  if(d.net!==null&&(!Number.isFinite(d.net)||d.net<0))return 'KDV hariç tutar geçersiz.';
  if(d.vat!==null&&(!Number.isFinite(d.vat)||d.vat<0))return 'KDV tutarı geçersiz.';
  if(d.vatRate!==null&&(!Number.isFinite(d.vatRate)||d.vatRate<0||d.vatRate>100))return 'KDV oranı geçersiz.';
  if(d.items.some(i=>!i.name||!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.amount)||i.amount<0))return 'Ürün satırlarında ad, miktar veya tutar eksik.';
  if(d.total===null&&d.items.length===0)return 'Belgenin toplam tutarı veya en az bir ürün kalemi olmalı.';
  if(d.documentType==='delivery_note'){d.net=null;d.vat=null;d.vatRate=null;}
  if(d.documentType==='pos'){d.net=null;d.vat=null;d.vatRate=null;}
  return '';
}
function scannedDocumentTotalDiscrepancy(d){
  const sum=Math.round(d.items.reduce((s,i)=>s+Number(i.amount||0),0)*100)/100;
  const target=d.documentType==='einvoice'?d.net:d.total;
  return d.items.length>0&&target!=null&&Math.abs(sum-target)>.06;
}
function saveScannedDocument(){
  if(readOnlyRecovery)return NativeStore.showMessage('Veri kurtarma modunda kayıt yapılamaz.');
  if(!pendingOcr)return NativeStore.showMessage('Önce belgeyi okut.');
  const d=readReviewedDocument(),error=validateReviewedDocument(d);
  if(error)return NativeStore.showMessage(error);
  const key=x=>String(x||'').trim().toLocaleLowerCase('tr-TR');
  if(scoped('documents').some(doc=>Number(doc.id)!==Number(editingDocumentId)&&
      (doc.fingerprint===d.fingerprint||
      (d.number&&doc.documentType===d.documentType&&key(doc.number)===key(d.number)&&
       key(doc.party)===key(d.party)&&doc.date===d.date)))) {
    return NativeStore.showMessage('Bu belge daha önce kaydedilmiş. Mükerrer kayıt engellendi.');
  }
  if(scannedDocumentTotalDiscrepancy(d)&&!confirm('Ürün kalemleri toplamı ile belge toplamı uyuşmuyor. İndirim / okunamayan satır olabilir. Yine de kaydedilsin mi?'))return;
  let doc;
  if(editingDocumentId){
    doc=scoped('documents').find(x=>Number(x.id)===Number(editingDocumentId));
    if(!doc)return NativeStore.showMessage('Düzenlenen belge bulunamadı.');
    if(doc.linkedInvoiceId||doc.linkedTransactionId||doc.stockApplied)return NativeStore.showMessage('Bağlı mali veya stok işlemi olan belge düzenlenemez.');
    Object.assign(doc,{...d,id:doc.id,companyId:db.activeCompanyId,
      items:d.items.map(item=>({...item})),updatedAt:new Date().toISOString()});
  }else{
    doc={...d,id:newRecordId(),companyId:db.activeCompanyId,
      items:d.items.map(item=>({...item})),linkedInvoiceId:0,linkedTransactionId:0,
      createdAt:new Date().toISOString()};
    db.documents.unshift(doc);
  }
  delete doc.text;
  if(doc.rawText)doc.rawText=String(doc.rawText).slice(0,180000);
  clearOcr();persist();
  showView('documents');
  NativeStore.showMessage('Belge bilgileri ve tüm ürün satırları kaydedildi.');
}
function editSavedDocument(id){
  const doc=scoped('documents').find(x=>Number(x.id)===Number(id));
  if(!doc)return NativeStore.showMessage('Belge bulunamadı.');
  if(doc.linkedInvoiceId||doc.linkedTransactionId||doc.stockApplied)return NativeStore.showMessage('Bağlı mali veya stok işlemi olan belge düzenlenemez.');
  editingDocumentId=doc.id;pendingOcrSourceDocumentId=0;
  pendingOcr={...doc,text:doc.rawText||'',items:(doc.items||[]).map(x=>({...x}))};
  showView('invoices');
  $('ocrText').textContent=doc.rawText||'Metin arşivi bulunmuyor.';
  renderOcrReview();
  $('ocrPreview').classList.remove('hidden');
  $('ocrStatus').textContent='Kaydedilmiş belgeyi düzenliyorsun. Değişikliklerden sonra kaydet.';
}
function openInvoiceFromDocument(id){
  const doc=scoped('documents').find(x=>Number(x.id)===Number(id));
  if(!doc||!['einvoice','invoice'].includes(doc.documentType))return NativeStore.showMessage('Bu belge fatura değil.');
  if(doc.linkedInvoiceId)return NativeStore.showMessage('Bu belge zaten bir faturaya bağlı. İkinci kayıt oluşturulmadı.');
  pendingOcr={...doc,text:doc.rawText,items:(doc.items||[]).map(x=>({...x}))};
  pendingOcrSourceDocumentId=doc.id;
  showView('invoices');
  openForm('invoice');
}
function linkDeliveryToInvoice(id){
  const doc=scoped('documents').find(x=>Number(x.id)===Number(id));
  if(!doc||doc.documentType!=='delivery_note')return;
  const select=$('invoiceLink'+id);
  const invoice=scoped('invoices').find(x=>Number(x.id)===Number(select?.value));
  if(!invoice)return NativeStore.showMessage('Önce geçerli faturayı seç.');
  if(!confirm('İrsaliye '+(doc.number||'numarasız')+' ile '+(invoice.number||'numarasız')+
     ' numaralı fatura eşleştirilsin mi? Ek muhasebe fişi oluşturulmayacak.'))return;
  doc.linkedInvoiceId=invoice.id;
  persist();
}
function unlinkDeliveryFromInvoice(id){
  const doc=scoped('documents').find(x=>Number(x.id)===Number(id));
  if(!doc||doc.documentType!=='delivery_note'||!doc.linkedInvoiceId)return;
  if(!confirm('İrsaliyenin fatura eşleştirmesi kaldırılsın mı?'))return;
  doc.linkedInvoiceId=0;persist();
}
function postReceiptExpense(id){
  if(readOnlyRecovery)return NativeStore.showMessage('Veri kurtarma modunda kayıt yapılamaz.');
  const doc=scoped('documents').find(x=>Number(x.id)===Number(id));
  if(!doc||doc.documentType!=='receipt')return NativeStore.showMessage('Yalnızca fiş için gider oluşturulur.');
  if(doc.linkedTransactionId)return NativeStore.showMessage('Bu fiş için gider zaten oluşturulmuş.');
  const amount=Number(doc.total||0),accountId=Number($('receiptAccount'+id)?.value||0);
  if(!(amount>0)||!scoped('accounts').some(a=>Number(a.id)===accountId))
    return NativeStore.showMessage('Fiş toplamı ve ödeme hesabını kontrol et.');
  if(!confirm('Fiş tutarı '+money(amount)+' için yeni gider ve muhasebe fişi TASLAĞI oluşturulsun mu? Aynı POS slipini ayrıca kaydetme.'))return;
  const tx={id:newRecordId(),companyId:db.activeCompanyId,date:doc.date||dateToday(),
    amount,type:'expense',description:'Fiş '+(doc.number||'')+' - '+(doc.party||'Perakende alışveriş'),
    category:'Perakende fişi',party:doc.party||'',accountId,
    sourceType:'scanned-receipt',sourceId:doc.id};
  db.transactions.unshift(tx);
  addTransactionVoucher(tx);
  doc.linkedTransactionId=tx.id;
  persist();
}
function renderDocuments(){
  if(!$('documentList'))return;
  const docs=scoped('documents');
  const notes=docs.filter(d=>d.documentType==='delivery_note').length;
  const receipts=docs.filter(d=>d.documentType==='receipt').length;
  const invoices=docs.filter(d=>['einvoice','invoice'].includes(d.documentType)).length;
  $('documentCounts').textContent='Toplam '+docs.length+' belge • '+notes+' irsaliye • '+receipts+
    ' market fişi • '+invoices+' fatura';
  const accounts=scoped('accounts');
  const invoiceOptions=scoped('invoices').map(i=>'<option value="'+i.id+'">'+esc((i.number||'Numarasız')+' — '+(i.party||'')+' ('+money(i.total)+')')+'</option>').join('');
  $('documentList').innerHTML=docs.slice(0,120).map(d=>{
    const items=Array.isArray(d.items)?d.items:[];
    const link=d.linkedInvoiceId?scoped('invoices').find(i=>Number(i.id)===Number(d.linkedInvoiceId)):null;
    const rows=items.map((i,idx)=>
      '<div class="row"><span style="min-width:0;flex:1">'+(idx+1)+'. '+esc(i.code?i.code+' • '+i.name:i.name)+
      '<div class="muted">'+esc(i.quantity)+' '+esc(i.unit)+' × '+money(i.unitPrice)+
      (i.vatRate==null?'':' • KDV %'+esc(i.vatRate))+'</div></span><b>'+money(i.amount)+'</b></div>').join('');
    let actions=(!d.linkedInvoiceId&&!d.linkedTransactionId)?
      '<button class="tag" onclick="editSavedDocument('+d.id+')">Belgeyi düzenle</button> ':' ';
    if(['einvoice','invoice'].includes(d.documentType)){
      actions=d.linkedInvoiceId?'<p class="muted">Faturaya aktarıldı.</p>':
        '<button class="tag" onclick="openInvoiceFromDocument('+d.id+')">Fatura taslağı oluştur</button>';
    }else if(d.documentType==='delivery_note'){
      actions=link?'<span class="muted">Bağlı fatura: '+esc(link.number||'Numarasız')+'</span> '+
        '<button class="tag" onclick="unlinkDeliveryFromInvoice('+d.id+')">Eşleştirmeyi kaldır</button>':
        '<div class="formgrid"><div class="field"><label>Faturayla eşleştir</label>'+
        '<select id="invoiceLink'+d.id+'"><option value="">Fatura seç</option>'+invoiceOptions+'</select></div></div>'+
        '<button class="tag" onclick="linkDeliveryToInvoice('+d.id+')">İrsaliyeyi eşleştir</button>';
    }else if(d.documentType==='receipt'){
      actions=d.linkedTransactionId?'<p class="muted">Gider kaydına aktarıldı. Tekrar gider yazılmadı.</p>':
        '<div class="field"><label>Gider için ödeme hesabı</label><select id="receiptAccount'+d.id+'">'+
        accounts.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></div>'+
        '<button class="tag" onclick="postReceiptExpense('+d.id+')">Onayla ve gider kaydı oluştur</button>';
    }else if(d.documentType==='pos')actions='<p class="muted">POS slipi ödeme kanıtıdır. Muhasebeye ikinci gider olarak işlenmez.</p>';
    return '<details style="border-bottom:1px solid #e5eaf2;padding:12px 0">'+
      '<summary><b>'+esc(documentTypeName(d.documentType))+'</b> · '+esc(d.party||'Satıcı belirtilmedi')+
      ' · '+esc(d.date||'Tarih yok')+' <b>'+money(d.total)+'</b></summary>'+
      '<p class="muted">No: '+esc(d.number||'Okunamadı')+' • VKN: '+esc(d.taxNo||'Okunamadı')+
      ' • Ürün: '+items.length+'</p>'+
      (d.warnings||[]).map(w=>'<p class="muted">⚠ '+esc(w)+'</p>').join('')+
      (rows||'<div class="muted">Ürün kalemi bulunmuyor.</div>')+
      '<div style="margin-top:12px">'+actions+'</div></details>';
  }).join('')||'<div class="empty">Henüz okutulmuş belge yok. Faturalar ekranından kamera ile fiş, fatura veya irsaliye okutabilirsin.</div>';
  if(docs.length>120)$('documentList').innerHTML+='<p class="muted">İlk 120 belge görüntüleniyor. Diğer belgeler kayıtlıdır.</p>';
}

