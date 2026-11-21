/* Akilli Muhasebe 1.0 — app_bank.js */
let pendingBank=null;

function clearBankPreview(){
  if($('bankMapping'))$('bankMapping').classList.add('hidden');
  if($('bankPreview'))$('bankPreview').classList.add('hidden');
  if($('bankFileStatus'))$('bankFileStatus').textContent='Ekstre seçilmedi.';
}
function handleBankFile(event){
  const file=event.target.files&&event.target.files[0]; if(!file)return;
  pendingBank=null;
  $('bankMapping').classList.add('hidden');$('bankPreview').classList.add('hidden');
  if(!/\.(csv|txt|xlsx)$/i.test(file.name)){ $('bankFileStatus').textContent='Yalnızca CSV, TXT ve XLSX dosyaları destekleniyor.';return;}
  if(file.size>8*1024*1024){$('bankFileStatus').textContent='Ekstre 8 MB sınırını aşıyor.';return;}
  $('bankFileStatus').textContent='Dosya cihazda okunuyor: '+file.name;
  const reader=new FileReader();
  reader.onload=()=>{const base64=String(reader.result||'').split(',')[1]||'';if(!base64){$('bankFileStatus').textContent='Dosya okunamadı.';return;}NativeStore.parseBankFile(base64,file.name);};
  reader.onerror=()=>$('bankFileStatus').textContent='Dosya açılamadı.';
  reader.readAsDataURL(file);
}
window.onBankFileResult=function(result){
  if(!result||!result.success){$('bankFileStatus').textContent=result?.error||'Ekstre ayrıştırılamadı.';return;}
  pendingBank={headers:result.headers||[],rows:result.rows||[],filename:result.filename||'ekstre',format:result.format||'',prepared:[],skipped:0,accountId:null};
  $('bankFileStatus').textContent=pendingBank.rows.length+' satır okundu ('+pendingBank.format+'). Sütunları kontrol et.';
  for(const id of ['bankMapDate','bankMapDescription','bankMapAmount','bankMapCredit','bankMapDebit','bankMapReference']){
    const element=$(id);element.innerHTML='<option value="">Seçilmedi</option>'+pendingBank.headers.map((v,i)=>'<option value="'+i+'">'+esc(v||('Sütun '+(i+1)))+'</option>').join('');
  }
  const guess=(id,phrases)=>{const index=pendingBank.headers.findIndex(x=>phrases.some(p=>bankPlain(x).includes(p)));if(index>=0)$(id).value=String(index)};
  guess('bankMapDate',['tarih','islem tarihi','valortarihi','date']);
  guess('bankMapDescription',['aciklama','islem aciklama','description','detay','islem','alici','gonderen']);
  guess('bankMapAmount',['tutar','amount','islem tutari','hareket tutari']);
  guess('bankMapCredit',['alacak','giris','gelen','credit','deposit']);
  guess('bankMapDebit',['borc','cikis','giden','debit','withdrawal']);
  guess('bankMapReference',['referans','dekont','islem no','transaction id','ref']);
  const accounts=scoped('accounts').filter(x=>x.kind==='bank'||x.kind==='other');
  const options=(accounts.length?accounts:scoped('accounts')).map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('');
  $('bankAccountId').innerHTML=options;
  $('bankMapping').classList.remove('hidden');
};
function bankPlain(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();}
function parseBankDate(s){
  const text=String(s??'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(text))return text.slice(0,10);
  const m=text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if(m){const day=Number(m[1]),mon=Number(m[2]);if(day>=1&&day<=31&&mon>=1&&mon<=12)return m[3]+'-'+String(mon).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  const serial=Number(text);if(serial>25000&&serial<100000){const d=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000);return d.toISOString().slice(0,10);}
  return '';
}
function bankNormalizedKey(row){
  const normalizedDescription=bankPlain(row.description).replace(/\s+/g,' ').slice(0,100);
  return [row.fileName,row.lineNo,row.accountId,row.date,Math.round(row.amount*100),normalizedDescription,bankPlain(row.reference)].join('|');
}
function prepareBankRows(){
  if(!pendingBank)return;
  const get=id=>$(id).value===''?-1:Number($(id).value);
  const columns={date:get('bankMapDate'),description:get('bankMapDescription'),amount:get('bankMapAmount'),credit:get('bankMapCredit'),debit:get('bankMapDebit'),reference:get('bankMapReference')};
  const accountId=Number($('bankAccountId').value);
  if(columns.date<0||columns.description<0||(columns.amount<0&&(columns.credit<0||columns.debit<0))){
    $('bankFileStatus').textContent='Tarih, açıklama ve tutar sütunlarını seçmelisin.';return;
  }
  if(!scoped('accounts').some(a=>Number(a.id)===accountId)){NativeStore.showMessage('Geçerli kasa/banka hesabı seç.');return;}
  const getCell=(row,index)=>index<0?'':String(row[index]||'').trim();
  const prepared=[];let skipped=0;
  for(let i=0;i<pendingBank.rows.length;i++){
    const cells=pendingBank.rows[i],date=parseBankDate(getCell(cells,columns.date));
    const description=getCell(cells,columns.description).slice(0,300);
    let amount=columns.amount>=0?parseTurkishMoney(getCell(cells,columns.amount)):
      (Math.abs(parseTurkishMoney(getCell(cells,columns.credit)))-Math.abs(parseTurkishMoney(getCell(cells,columns.debit))));
    amount=Math.round(amount*100)/100;
    if(!date||!description||!Number.isFinite(amount)||amount===0){skipped++;continue;}
    const row={fileName:pendingBank.filename,lineNo:i+2,accountId,date,description,amount,reference:getCell(cells,columns.reference).slice(0,120)};
    row.key=bankNormalizedKey(row);
    prepared.push(row);
  }
  pendingBank.prepared=prepared;pendingBank.skipped=skipped;pendingBank.accountId=accountId;
  $('bankPreviewInfo').textContent=prepared.length+' geçerli hareket • '+skipped+' atlanan satır. İşaretler: + giriş, - çıkış. Dosyada ters işaret varsa içe aktarma yapma.';
  $('bankPreviewRows').innerHTML=prepared.slice(0,12).map(x=>'<div class="row"><div><b>'+esc(x.date)+'</b><div class="muted">'+esc(x.description)+'</div></div><b class="'+(x.amount>0?'positive':'negative')+'">'+money(x.amount)+'</b></div>').join('')||'<div class="empty">Geçerli hareket bulunamadı.</div>';
  $('bankPreview').classList.remove('hidden');
}
function importBankRows(){
  if(!pendingBank||!pendingBank.prepared.length)return NativeStore.showMessage('Önce geçerli satırları incele.');
  if(!confirm(pendingBank.prepared.length+' banka hareketi aktarılacak. Bu işlem kasa bakiyesini otomatik değiştirmez. Onaylıyor musun?'))return;
  const existing=new Set(scoped('bankRows').map(r=>r.key)),companyId=db.activeCompanyId;
  let added=0,duplicates=0;
  for(const row of pendingBank.prepared){
    if(existing.has(row.key)){duplicates++;continue;}
    const id=newRecordId();db.bankRows.unshift({...row,id,companyId,status:'unmatched',matchedTxId:0,suggestedTxId:0});
    existing.add(row.key);added++;
  }
  $('bankFileStatus').textContent=added+' hareket aktarıldı; '+duplicates+' aynı dosya/satır daha önce aktarılmış.';
  pendingBank=null;$('bankPreview').classList.add('hidden');$('bankMapping').classList.add('hidden');$('bankFile').value='';
  persist();
}
function bankSuggestedTransaction(bankRow,used){
  const sign=r=>r.type==='income'?1:-1;
  const matches=scoped('transactions').filter(t=>
    Number(t.accountId)===Number(bankRow.accountId)
    && Math.abs(Number(t.amount)*sign(t)-Number(bankRow.amount))<=0.01
    && Math.abs((Date.parse(t.date+'T00:00:00')-Date.parse(bankRow.date+'T00:00:00'))/86400000)<=3
    && !used.has(Number(t.id))
  );
  return matches.length===1?matches[0]:null;
}
function suggestBankMatches(){
  const alreadyUsed=new Set(scoped('bankRows').filter(r=>r.status==='matched').map(r=>Number(r.matchedTxId)));
  let suggested=0,unresolved=0;
  for(const row of scoped('bankRows')){
    if(row.status!=='unmatched')continue;
    const match=bankSuggestedTransaction(row,alreadyUsed);
    if(match){row.status='suggested';row.suggestedTxId=match.id;alreadyUsed.add(Number(match.id));suggested++;}
    else unresolved++;
  }
  persist();NativeStore.showMessage(suggested+' eşleşme önerildi, '+unresolved+' hareket eşleşmedi.');
}
function approveBankMatch(id){
  const row=scoped('bankRows').find(r=>Number(r.id)===Number(id));
  if(!row||row.status!=='suggested')return;
  const tx=scoped('transactions').find(t=>Number(t.id)===Number(row.suggestedTxId));
  if(!tx)return NativeStore.showMessage('Önerilen muhasebe kaydı bulunamadı.');
  if(!confirm('Banka hareketi mevcut muhasebe kaydıyla eşleştirilsin mi?'))return;
  row.status='matched';row.matchedTxId=tx.id;row.suggestedTxId=0;persist();
}
function createBankTransaction(id){
  const row=scoped('bankRows').find(r=>Number(r.id)===Number(id));
  if(!row||row.status==='matched')return NativeStore.showMessage('Bu banka hareketi zaten eşleştirilmiş.');
  if(!confirm('Bu ekstre satırından YENİ gelir/gider kaydı ve muhasebe fişi TASLAĞI oluşturulsun mu? Önce başka kayıt olmadığını kontrol et.'))return;
  const idTx=newRecordId();
  const tx={id:idTx,companyId:db.activeCompanyId,date:row.date,description:row.description,
      amount:Math.abs(row.amount),type:row.amount>0?'income':'expense',party:'',category:'Banka ekstresi',
      accountId:row.accountId,sourceType:'bank-import',sourceId:row.id};
  db.transactions.unshift(tx);addTransactionVoucher(tx);
  row.status='matched';row.matchedTxId=idTx;row.suggestedTxId=0;
  persist();
}
function changeBankRowStatus(id,status){
  const row=scoped('bankRows').find(r=>Number(r.id)===Number(id));if(!row)return;
  if(status==='ignored'&&!confirm('Ekstre hareketi dikkate alınmasın mı?'))return;
  if(row.status==='matched'&&status==='unmatched'){
    const tx=scoped('transactions').find(t=>Number(t.id)===Number(row.matchedTxId));
    if(tx&&tx.sourceType==='bank-import')return NativeStore.showMessage('Önce bu ekstre satırından oluşturulan gelir/gider hareketini sil.');
  }
  row.status=status;row.suggestedTxId=0;if(status==='unmatched')row.matchedTxId=0;persist();
}
function renderBankStatement(){
  if(!$('bankImportedList'))return;
  const bankAccounts=scoped('accounts'),previous=$('bankAccountId')?.value;
  if($('bankAccountId')&&$('bankMapping')&&!$('bankMapping').classList.contains('hidden')){
    $('bankAccountId').innerHTML=bankAccounts.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('');
    if(previous&&bankAccounts.some(x=>String(x.id)===previous))$('bankAccountId').value=previous;
  }
  const rows=scoped('bankRows'),matched=rows.filter(x=>x.status==='matched').length,
    proposed=rows.filter(x=>x.status==='suggested').length,
    ignored=rows.filter(x=>x.status==='ignored').length;
  $('bankCounts').innerHTML='<div class="row"><span>Toplam satır</span><b>'+rows.length+'</b></div><div class="row"><span>Eşleşmiş</span><b class="positive">'+matched+'</b></div><div class="row"><span>Onay bekleyen öneri</span><b>'+proposed+'</b></div><div class="row"><span>Eşleşmemiş</span><b class="negative">'+(rows.length-matched-proposed-ignored)+'</b></div><div class="row"><span>Yoksayılan</span><b>'+ignored+'</b></div>';
  $('bankImportedList').innerHTML=rows.slice(0,120).map(r=>{
    const tx=scoped('transactions').find(t=>Number(t.id)===Number(r.suggestedTxId||r.matchedTxId));
    const badge=r.status==='matched'?'Eşleşti':r.status==='suggested'?'Öneri var':r.status==='ignored'?'Yoksayıldı':'Eşleşmedi';
    const options=r.status==='suggested'?'<button class="tag" onclick="approveBankMatch('+r.id+')">Eşleşmeyi onayla</button>':
        r.status==='unmatched'?'<button class="tag" onclick="createBankTransaction('+r.id+')">Yeni hareket oluştur</button>':'';
    const reset=r.status==='ignored'||r.status==='suggested'||r.status==='matched'?
      '<button class="tag" onclick="changeBankRowStatus('+r.id+',\'unmatched\')">Geri al</button>':
      '<button class="tag" onclick="changeBankRowStatus('+r.id+',\'ignored\')">Yoksay</button>';
    return '<div class="row"><div style="min-width:0;flex:1"><b>'+esc(r.date)+' • '+esc(r.description)+'</b><div class="muted">'+esc(r.reference||r.fileName)+' · '+badge+(tx?' · '+esc(tx.description):'')+'</div><div class="toolbar" style="margin-top:4px">'+options+reset+'</div></div><div style="text-align:right"><b class="'+(r.amount>0?'positive':'negative')+'">'+money(r.amount)+'</b></div></div>';
  }).join('')||'<div class="empty">Henüz banka ekstresi aktarılmadı.</div>';
  if(rows.length>120)$('bankImportedList').innerHTML+='<p class="muted">İlk 120 satır gösteriliyor. Diğerleri kayıtlıdır.</p>';
}
function getAuditFindings(){
  const findings=[],add=(severity,title,detail,view)=>findings.push({severity,title,detail,view});
  const invoices=scoped('invoices'),vouchers=scoped('vouchers'),customers=scoped('customers');
  const keys=new Map();
  for(const inv of invoices){
    const key=[bankPlain(inv.number),bankPlain(inv.party),inv.date].join('|');
    if(inv.number&&keys.has(key))add('yüksek','Tekrarlanan fatura','Aynı numara, firma ve tarih: '+inv.number+' / '+inv.party,'invoices');
    else keys.set(key,inv.id);
    if(!inv.number||!inv.party)add('orta','Eksik fatura bilgisi','Fatura numarası veya firma eksik.','invoices');
    if(Number(inv.paidAmount||0)>Number(inv.total||0)+0.01)add('yüksek','Aşırı ödeme','Fatura '+inv.number+' için ödeme toplamı aşıyor.','invoices');
    if(Math.abs((Number(inv.net||0)+Number(inv.vat||0))-Number(inv.total||0))>0.05)add('yüksek','Fatura tutarı tutarsız','Fatura '+inv.number+' matrah + KDV toplamına uymuyor.','invoices');
    if(!inv.taxNo)add('orta','Vergi numarası eksik','Fatura '+inv.number+' için vergi numarası kontrol edilmeli.','invoices');
  }
  for(const v of vouchers){
    const entries=v.entries||[],debit=entries.reduce((a,x)=>a+Number(x.debit||0),0),credit=entries.reduce((a,x)=>a+Number(x.credit||0),0);
    if(!entries.length||Math.abs(debit-credit)>0.01)add('yüksek','Dengesiz muhasebe fişi','Fiş '+(v.voucherNo||'')+' borç/alacak tutarları eşit değil.','vouchers');
  }
  const txIds=new Set(scoped('transactions').map(x=>Number(x.id)));
  const dangling=scoped('bankRows').filter(x=>x.status==='matched'&&!txIds.has(Number(x.matchedTxId))).length;
  if(dangling)add('yüksek','Kopmuş banka eşleşmesi',dangling+' eşleşmenin muhasebe hareketi silinmiş.','bankStatement');
  const unpaired=scoped('bankRows').filter(x=>x.status==='unmatched').length;
  if(unpaired)add('orta','Mutabakat bekliyor',unpaired+' banka hareketi henüz eşleştirilmedi.','bankStatement');
  const late=overdueInvoices().length;
  if(late)add('orta','Gecikmiş tahsilat/ödeme',late+' faturanın vadesi geçmiş.','overdue');
  const noTaxId=customers.filter(x=>!x.taxNo).length;
  if(noTaxId)add('bilgi','Eksik cari vergi kimliği',noTaxId+' cari hesapta vergi numarası bulunmuyor.','customers');
  return findings;
}
function renderAudit(){
  if(!$('auditFindings'))return;
  const findings=getAuditFindings();
  const critical=findings.filter(x=>x.severity==='yüksek').length;
  $('auditSummary').innerHTML='<div class="row"><span>Toplam kontrol bulgusu</span><b>'+findings.length+'</b></div><div class="row"><span>Öncelikli bulgular</span><b class="negative">'+critical+'</b></div>';
  $('auditFindings').innerHTML=findings.map(x=>'<div class="row"><div style="flex:1"><b>'+esc(x.title)+'</b><div class="muted">'+esc(x.detail)+'</div></div><div><span class="badge">'+esc(x.severity)+'</span><button class="tag" onclick="showView(\''+x.view+'\')">İncele</button></div></div>').join('')||'<div class="empty">Taranan kayıtlar içinde belirlenen kurallara göre hata bulunmadı.</div>';
}
function handleInvoicePdf(event){
  const file=event.target.files&&event.target.files[0];if(!file)return;
  if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')return NativeStore.showMessage('Yalnızca PDF fatura seç.');
  if(file.size>10*1024*1024)return NativeStore.showMessage('PDF 10 MB sınırını aşıyor.');
  $('ocrPreview').classList.add('hidden');
  $('ocrStatus').textContent='PDF fatura okunuyor: '+file.name;
  const reader=new FileReader();
  reader.onload=()=>{const base64=String(reader.result||'').split(',')[1];if(!base64){$('ocrStatus').textContent='PDF açılamadı.';return;}NativeStore.recognizeInvoicePdf(base64);};
  reader.onerror=()=>$('ocrStatus').textContent='PDF okunamadı.';
  reader.readAsDataURL(file);
}



