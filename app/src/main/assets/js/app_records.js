/* Akilli Muhasebe 1.0 — app_records.js */
function saveForm(){if(readOnlyRecovery)return NativeStore.showMessage('Veri kurtarma modu açık. Önce şifreli yedek geri yüklenmeli.');const d=readForm(),id=newRecordId();
if(formKind==='company'){if(!d.name)return NativeStore.showMessage('Firma adı girin.');const company={...d,id,fiscalYear:d.fiscalYear||String(new Date().getFullYear())};db.companies.push(company);db.activeCompanyId=id;db.accounts.push({id:newRecordId(),companyId:id,name:'Kasa',kind:'cash',opening:0},{id:newRecordId(),companyId:id,name:'Banka',kind:'bank',opening:0});db.chartAccounts.push(...defaultChartFor(id));}
if(formKind==='transaction'){if(!d.description||Number(d.amount)<=0)return NativeStore.showMessage('Açıklama ve geçerli tutar girin.');const tx={...d,id,companyId:db.activeCompanyId,amount:Number(d.amount),accountId:Number(d.accountId)||scoped('accounts')[0]?.id};db.transactions.unshift(tx);addTransactionVoucher(tx);}
if(formKind==='customer'){if(!d.name)return NativeStore.showMessage('Ad veya firma adı girin.');db.customers.unshift({...d,id,companyId:db.activeCompanyId,openingReceivable:Number(d.openingReceivable)||0,openingPayable:Number(d.openingPayable)||0});}
if(formKind==='invoice'){
 if(!d.party||Number(d.net)<=0)return NativeStore.showMessage('Firma ve tutar girin.');
 if(d.number&&scoped('invoices').some(i=>String(i.number||'').trim().toLocaleLowerCase('tr-TR')===String(d.number).trim().toLocaleLowerCase('tr-TR')&&String(i.party||'').trim().toLocaleLowerCase('tr-TR')===String(d.party).trim().toLocaleLowerCase('tr-TR')))
   return NativeStore.showMessage('Bu firma ve fatura numarası zaten kayıtlı.');
 const net=AccountingRules.round(Number(d.net)),rate=Number(d.vatRate||0);
 if(!Number.isFinite(rate)||rate<0||rate>100)return NativeStore.showMessage('KDV oranı geçersiz.');
 const vat=AccountingRules.round(net*rate/100),total=AccountingRules.round(net+vat);
 let paid=AccountingRules.round(Number(d.paidAmount)||0);if(d.status==='paid'&&paid===0)paid=total;if(paid<0||paid>total+0.01)return NativeStore.showMessage('Ödenen tutar fatura toplamını aşamaz.');
 if(d.status==='partial'&&paid<=0)return NativeStore.showMessage('Kısmi ödeme için ödenen tutarı girin.');
 if(paid>=total-0.01)d.status='paid';else if(paid>0)d.status='partial';else d.status='unpaid';
 let customer=scoped('customers').find(c=>Number(c.id)===Number(d.customerId))||scoped('customers').find(c=>String(c.name||'').trim().toLocaleLowerCase('tr-TR')===String(d.party||'').trim().toLocaleLowerCase('tr-TR'));
 if(!customer){const customerId=newRecordId();customer={id:customerId,companyId:db.activeCompanyId,name:d.party,type:d.type==='sale'?'customer':'supplier',taxNo:d.taxNo||'',phone:'',email:'',address:'',openingReceivable:0,openingPayable:0};db.customers.unshift(customer);}
 const inv={...d,id,companyId:db.activeCompanyId,customerId:customer.id,net,vatRate:rate,vat,total,paidAmount:paid,ocrSourceText:pendingOcr?.text||'',items:(pendingOcr?.items||[]).map(x=>({...x})),sourceDocumentId:pendingOcrSourceDocumentId||0};db.invoices.unshift(inv);
 if(pendingOcrSourceDocumentId){const source=scoped('documents').find(x=>Number(x.id)===Number(pendingOcrSourceDocumentId));if(source)source.linkedInvoiceId=id;}
 addLedgerEntry({customerId:customer.id,party:customer.name,kind:d.type==='sale'?'receivable':'payable',amount:total,date:d.date,description:'Fatura '+(d.number||''),sourceType:'invoice',sourceId:id});
 addInvoiceVoucher(inv);
 if(paid>0){const paymentId=newRecordId();const tx={id:paymentId,companyId:db.activeCompanyId,date:d.date||dateToday(),type:d.type==='sale'?'income':'expense',description:(d.type==='sale'?'Fatura tahsilatı ':'Fatura ödemesi ')+(d.number||''),amount:paid,category:d.type==='sale'?'Fatura tahsilatı':'Fatura ödemesi',party:customer.name,accountId:Number(d.accountId)||scoped('accounts')[0]?.id,customerId:customer.id,sourceType:'invoice-payment',sourceId:id};db.transactions.unshift(tx);addLedgerEntry({customerId:customer.id,party:customer.name,kind:d.type==='sale'?'receivable':'payable',amount:-paid,date:d.date,description:d.type==='sale'?'Fatura tahsilatı':'Tedarikçi ödemesi',sourceType:'invoice-payment',sourceId:id});addTransactionVoucher(tx);}
}
if(formKind==='employee'){if(!d.name)return NativeStore.showMessage('Personel adı girin.');d.gross=Number(d.gross)||0;db.employees.unshift({...d,id,companyId:db.activeCompanyId});}
if(formKind==='payroll'){const e=scoped('employees').find(x=>x.id===Number(d.employeeId));if(!e)return NativeStore.showMessage('Önce personel kaydı ekleyin.');const gross=Number(d.gross||e.gross)||0,extras=Number(d.extras)||0,deductions=Number(d.deductions)||0;if(gross+extras<deductions)return NativeStore.showMessage('Kesintiler toplam kazançtan fazla olamaz.');db.payroll.unshift({...d,id,companyId:db.activeCompanyId,employeeName:e.name,gross,extras,deductions,net:gross+extras-deductions});}
if(formKind==='account'){if(!d.name)return NativeStore.showMessage('Hesap adı girin.');db.accounts.push({...d,id,companyId:db.activeCompanyId,opening:Number(d.opening)||0});}
if(formKind==='asset'){if(!d.name||Number(d.cost)<=0||Number(d.life)<=0)return NativeStore.showMessage('Varlık adı, bedeli ve kullanım ömrünü girin.');db.assets.unshift({...d,id,companyId:db.activeCompanyId,cost:Number(d.cost),life:Number(d.life)});}
if(formKind==='reminder'){if(!d.title||!d.date)return NativeStore.showMessage('Başlık ve tarih girin.');db.reminders.unshift({...d,id,companyId:db.activeCompanyId});}
if(formKind==='settlement'){
 const customer=scoped('customers').find(c=>Number(c.id)===Number(d.customerId));const amount=Number(d.amount)||0;if(!customer||amount<=0)return NativeStore.showMessage('Cari hesap ve geçerli tutar seçin.');
 const receipt=d.direction==='receipt';const tx={id,companyId:db.activeCompanyId,date:d.date||dateToday(),type:receipt?'income':'expense',description:d.note||(receipt?'Müşteri tahsilatı':'Tedarikçi ödemesi'),amount,category:receipt?'Cari tahsilat':'Cari ödeme',party:customer.name,customerId:customer.id,accountId:Number(d.accountId)||scoped('accounts')[0]?.id,sourceType:'settlement',sourceId:id};db.transactions.unshift(tx);
 addLedgerEntry({customerId:customer.id,party:customer.name,kind:receipt?'receivable':'payable',amount:-amount,date:tx.date,description:tx.description,sourceType:'settlement',sourceId:id});addTransactionVoucher(tx);
}
if(formKind==='voucher'){
 const amount=Number(d.amount)||0;if(amount<=0)return NativeStore.showMessage('Fiş tutarı sıfırdan büyük olmalı.');if(d.debitCode===d.creditCode)return NativeStore.showMessage('Borç ve alacak hesapları farklı olmalı.');
 const debit=chartAccount(d.debitCode),credit=chartAccount(d.creditCode);if(!debit||!credit)return NativeStore.showMessage('Hesapları seçin.');
 const ok=addVoucher({id,voucherNo:d.voucherNo||nextVoucherNo(),date:d.date||dateToday(),type:d.type||'Mahsup',description:d.description||'Manuel muhasebe fişi',party:d.party||'',sourceType:'manual',sourceId:id,entries:[{accountCode:debit.code,accountName:debit.name,debit:amount,credit:0},{accountCode:credit.code,accountName:credit.name,debit:0,credit:amount}]});if(!ok)return NativeStore.showMessage('Fiş dengesi sağlanamadı.');
}
if(formKind==='instrument'){if(!d.party||!d.number||Number(d.amount)<=0||!d.dueDate)return NativeStore.showMessage('Firma, belge numarası, tutar ve vade zorunludur.');db.instruments.unshift({...d,id,companyId:db.activeCompanyId,amount:Number(d.amount),status:d.status||'pending'});}
auditEvent('kayit_olusturuldu',formKind,id);
if(!persist())return;
if(formKind==='invoice'){pendingOcr=null;pendingOcrSourceDocumentId=0;}
closeForm();NativeStore.showMessage('Kayıt eklendi.');}
function removeItem(type,id){
 if(readOnlyRecovery)return NativeStore.showMessage('Veri kurtarma modunda silme işlemi kapalı.');
 const allowed=['transactions','invoices','customers','vouchers','employees','payroll','accounts','assets','reminders','instruments','payrollEstimates','officialTasks'];
 if(!allowed.includes(type))return;
 const record=scoped(type).find(x=>Number(x.id)===Number(id));if(!record)return;
 if(type==='vouchers'&&record.sourceType!=='manual')return NativeStore.showMessage('Otomatik fişler bağlı işlemi üzerinden yönetilir.');
 if(type==='customers'&&(scoped('ledgerEntries').some(x=>Number(x.customerId)===Number(id))||scoped('invoices').some(x=>Number(x.customerId)===Number(id))))return NativeStore.showMessage('Hareketi olan cari silinemez.');
 if(type==='employees'&&scoped('payroll').some(x=>Number(x.employeeId)===Number(id)))return NativeStore.showMessage('Bordro kaydı bulunan personel silinemez.');
 if(type==='accounts'&&(scoped('transactions').some(x=>Number(x.accountId)===Number(id))||scoped('bankRows').some(x=>Number(x.accountId)===Number(id))))return NativeStore.showMessage('Hareketi olan kasa veya banka hesabı silinemez.');
 if(type==='transactions'&&record.sourceType==='invoice-payment')return NativeStore.showMessage('Fatura tahsilatı fatura üzerinden yönetilir.');
 if(!confirm('Bu kayıt ve bağlı muhasebe taslakları silinsin mi?'))return;
 const sameId=x=>Number(x.id)===Number(id);
 if(type==='invoices'){
    const paymentIds=scoped('transactions').filter(x=>x.sourceType==='invoice-payment'&&Number(x.sourceId)===Number(id)).map(x=>Number(x.id));
    const removed=new Set(paymentIds);
    for(const row of scoped('bankRows')){
      if(removed.has(Number(row.matchedTxId))||removed.has(Number(row.suggestedTxId))){row.status='unmatched';row.matchedTxId=0;row.suggestedTxId=0;}
    }
    db.ledgerEntries=db.ledgerEntries.filter(e=>!(e.companyId==db.activeCompanyId&&['invoice','invoice-payment'].includes(e.sourceType)&&Number(e.sourceId)===Number(id)));
    db.vouchers=db.vouchers.filter(v=>!(v.companyId==db.activeCompanyId&&['invoice','invoice-payment'].includes(v.sourceType)&&Number(v.sourceId)===Number(id)));
    db.transactions=db.transactions.filter(t=>!(t.companyId==db.activeCompanyId&&t.sourceType==='invoice-payment'&&Number(t.sourceId)===Number(id)));
    for(const doc of scoped('documents')){
      if(Number(doc.linkedInvoiceId)===Number(id))doc.linkedInvoiceId=0;
    }
 }
 if(type==='transactions'){
    db.ledgerEntries=db.ledgerEntries.filter(e=>!(e.companyId==db.activeCompanyId&&e.sourceType==='settlement'&&Number(e.sourceId)===Number(id)));
    db.vouchers=db.vouchers.filter(v=>!(v.companyId==db.activeCompanyId&&Number(v.sourceId)===Number(record.sourceId||id)&&v.sourceType===(record.sourceType||'transaction')));
    for(const row of scoped('bankRows')){
      if(Number(row.matchedTxId)===Number(id)||Number(row.suggestedTxId)===Number(id)){
        row.status='unmatched';row.matchedTxId=0;row.suggestedTxId=0;
      }
    }
    for(const doc of scoped('documents')){
      if(Number(doc.linkedTransactionId)===Number(id))doc.linkedTransactionId=0;
    }
 }
 db[type]=db[type].filter(x=>!sameId(x));
 auditEvent('kayit_silindi',type,id);
 persist();
}
function listRows(items,type){if(!items.length)return '<div class="empty">Henüz kayıt bulunmuyor.</div>';return items.map(x=>{let title=x.description||x.name||x.party||x.title||x.number||x.employeeName||'Kayıt',sub=x.date||x.startDate||x.period||x.phone||'';let val='',extra='';
if(type==='transactions')val='<b class="'+(x.type==='income'?'positive':'negative')+'">'+(x.type==='income'?'+':'-')+money(x.amount)+'</b>';
if(type==='invoices'){const late=x.dueDate&&x.dueDate<dateToday()&&invoiceRemaining(x)>0.009;val='<b>'+money(x.total)+'</b><div class="muted">'+(x.type==='sale'?'Satış':'Alış')+' • KDV '+money(x.vat)+'</div><div class="badge">'+(late?'Vadesi geçti':x.status==='paid'?'Ödendi':x.status==='partial'?'Kısmen ödendi':'Ödenmedi')+'</div>'+(x.items?.length?'<div><button class="tag" onclick="showInvoiceItems('+x.id+')">'+x.items.length+' ürün satırını gör</button></div>':'');}
if(type==='payroll')val='<b>'+money(x.net)+'</b><div class="muted">Net ön hesap</div>';
if(type==='assets'){const annual=x.cost/x.life;val='<b>'+money(x.cost)+'</b><div class="muted">Yıllık tahmini amortisman: '+money(annual)+'</div>'}
if(type==='reminders'){const due=new Date(x.date+'T00:00:00'),now=new Date(dateToday()+'T00:00:00'),days=Math.ceil((due-now)/86400000);extra='<span class="badge">'+(days<0?'Gecikmiş':days===0?'Bugün':days+' gün kaldı')+'</span>'}
if(type==='customers'){const b=customerBalances(x);sub=(x.type==='supplier'?'Tedarikçi':x.type==='both'?'Müşteri / Tedarikçi':'Müşteri')+(x.phone?' • '+x.phone:'');val='<div class="positive">Alacak '+money(b.receivable)+'</div><div class="negative">Borç '+money(b.payable)+'</div>'}
if(type==='employees')sub=(x.title||'Personel')+(x.startDate?' • '+x.startDate:'');
if(type==='instruments'){const late=x.status==='pending'&&x.dueDate&&x.dueDate<dateToday();extra='<span class="badge">'+(late?'Vadesi geçti':x.status==='paid'?'Ödendi':x.status==='bounced'?'Karşılıksız':x.status==='endorsed'?'Ciro edildi':x.status==='returned'?'İade':'Bekliyor')+'</span>';val='<b>'+money(x.amount)+'</b>'}
if(type==='vouchers'){extra='<span class="badge">'+(x.status==='approved'?'Onaylandı':'Taslak')+'</span>';val='<b>'+money(x.debitTotal)+'</b>'}
return '<div class="row"><div style="min-width:0;flex:1"><b>'+esc(title)+'</b><div class="muted">'+esc(sub)+'</div></div><div style="text-align:right">'+extra+val+'<div><button class="muted" style="border:0;background:none" onclick="removeItem(\''+type+'\','+x.id+')">Sil</button></div></div></div>'}).join('')}
function showInvoiceItems(id){
  const inv=scoped('invoices').find(x=>Number(x.id)===Number(id));if(!inv)return;
  $('formTitle').textContent='Fatura kalemleri — '+(inv.number||'Numarasız');
  const rows=(inv.items||[]).map((i,idx)=>'<div class="row"><div style="min-width:0;flex:1">'+
    '<b>'+esc((idx+1)+'. '+(i.code?i.code+' • ':'')+(i.name||''))+'</b>'+
    '<div class="muted">'+esc(i.quantity)+' '+esc(i.unit)+' × '+money(i.unitPrice)+
    (i.vatRate===null||i.vatRate===undefined?'':' • KDV %'+esc(i.vatRate))+
    '</div></div><b>'+money(i.amount)+'</b></div>').join('');
  $('formBody').innerHTML='<div class="notice">Fatura türü: '+esc(inv.type==='sale'?'Satış':'Alış')+
    ' • '+esc(inv.party)+'<br>Matrah: '+money(inv.net)+' • KDV: '+money(inv.vat)+
    ' • Toplam: '+money(inv.total)+'</div>'+(rows||'<div class="empty">Satır bilgisi kaydedilmemiş.</div>');
  $('modal').classList.remove('hidden');
}
function accountBalance(a){const movements=scoped('transactions').filter(x=>Number(x.accountId)===Number(a.id));return Number(a.opening||0)+movements.reduce((s,x)=>s+(x.type==='income'?Number(x.amount):-Number(x.amount)),0)}
function setVoucherStatus(id,status){
 if(readOnlyRecovery)return NativeStore.showMessage('Veri koruma modunda fiş değiştirilemez.');
 const v=scoped('vouchers').find(x=>Number(x.id)===Number(id));if(!v)return;
 if(status!=='draft'&&status!=='approved')return NativeStore.showMessage('Geçersiz fiş durumu.');
 if(status==='approved'&&!AccountingRules.balanceVoucher(v).balanced)
   return NativeStore.showMessage('Borç/alacak dengesi sağlanmadan fiş onaylanamaz.');
 v.status=status;persist();
}
function setInstrumentStatus(id,status){
 if(readOnlyRecovery)return NativeStore.showMessage('Veri koruma modunda değişiklik yapılamaz.');
 if(!['pending','paid','endorsed','bounced','returned'].includes(status))return;
 const x=scoped('instruments').find(i=>Number(i.id)===Number(id));if(!x)return;x.status=status;persist();
}

