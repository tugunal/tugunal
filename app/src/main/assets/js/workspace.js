/* Akilli Muhasebe 1.0 – navigation and workflow coordination.
   Preserves old modules while presenting a consistent workspace. */
"use strict";
const VIEW_TITLES={
  dashboard:"Genel Bakış",workflow:"İş Akışı",companies:"Mükellef Yönetimi",
  invoices:"Fatura ve Belge Okuma",documents:"Belge / İrsaliye Arşivi",
  transactions:"Gelir ve Gider",customers:"Cari Hesaplar",receivables:"Borç / Alacak",
  finance:"Kasa ve Banka",bankStatement:"Ekstre ve Mutabakat",vouchers:"Muhasebe Fişleri",
  inventory:"Stok / Depo",cashbook:"Günlük Kasa Defteri",instruments:"Çek ve Senet",
  employees:"Personel",payroll:"Bordro Ön Hesap",assets:"Demirbaşlar",
  reports:"Mali Raporlar",audit:"Hata Kontrol Merkezi",calendar:"Vergi Takvimi",
  overdue:"Vadesi Geçenler",activity:"İşlem Geçmişi",settings:"Ayarlar / Yedek",more:"Tüm Modüller"
};
function syncWorkspace(){
  if(!unlocked)return;
  const c=activeCompany();if(!c)return;
  const select=$("globalCompanySelect");
  if(select){
    const signature=db.companies.map(x=>x.id+"|"+x.name).join("\u001f");
    if(select.dataset.signature!==signature){
      select.innerHTML=db.companies.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+'</option>').join("");
      select.dataset.signature=signature;
    }
    select.value=String(db.activeCompanyId);
  }
  $("globalCompanyTax").textContent=c.taxOffice?"Vergi dairesi: "+c.taxOffice:"Yerel ve şifreli kayıt";
  document.querySelectorAll(".side-nav button[data-view]").forEach(button=>{
    button.classList.toggle("active",button.dataset.view===currentWorkspaceView);
  });
  const title=$("currentViewTitle");
  if(title)title.textContent=VIEW_TITLES[currentWorkspaceView]||"Muhasebe Çalışma Alanı";
  const pill=$("companyStatusPill");
  if(pill)pill.textContent="● "+c.name;
}
let currentWorkspaceView="dashboard";
function renderWorkflow(){
  if(!unlocked||!$("workflowStatus"))return;
  const docs=scoped("documents"),invoices=scoped("invoices"),bank=scoped("bankRows"),
    vouchers=scoped("vouchers");
  const due=invoices.filter(x=>x.dueDate&&x.dueDate<dateToday()&&invoiceRemaining(x)>.009);
  const unreviewed=docs.filter(d=>!d.verified).length;
  const unposted=docs.filter(d=>d.documentType==="receipt"&&!d.linkedTransactionId).length;
  const unmatched=bank.filter(r=>r.status==="unmatched").length;
  const unlinked=docs.filter(d=>d.documentType==="delivery_note"&&!d.linkedInvoiceId).length;
  const unbalanced=vouchers.filter(v=>!AccountingRules.balanceVoucher(v).balanced).length;
  const data=[
    ["Belgeler",docs.length,"documents","Okutulan / arşivlenen"],
    ["Kontrol bekleyen",unreviewed,"documents","Alanları kontrol et"],
    ["İşlenmeyen fiş",unposted,"documents","Gider taslakları"],
    ["İrsaliye",unlinked,"inventory","Fatura veya stok eşleştirme"],
    ["Ekstre",unmatched,"bankStatement","Eşleşmeyen banka hareketi"],
    ["Vadesi geçen",due.length,"overdue","Ödeme ve tahsilat"],
    ["Fiş kontrolü",unbalanced,"vouchers","Dengesi bozuk taslak"]
  ];
  $("workflowStatus").innerHTML=data.map(x=>'<button onclick="showView(\''+x[2]+'\')">'+
    '<strong>'+x[1]+'</strong>'+esc(x[0])+
    '<small>'+esc(x[3])+'</small></button>').join("");
  $("workflowReadiness").innerHTML=
    '<div class="row"><span>Aktif firma</span><b>'+esc(activeCompany().name)+'</b></div>'+
    '<div class="row"><span>Açık banka mutabakatı</span><b>'+unmatched+'</b></div>'+
    '<div class="row"><span>Muhasebe fişi denetimi</span><b>'+(unbalanced?"Kontrol gerekiyor":"Dengeli")+'</b></div>'+
    '<div class="row"><span>Resmî e-belge / SGK gönderimi</span><b>Entegrasyon etkin değil</b></div>';
}
function filterModules(){
  const q=String($("moduleSearch")?.value||"").trim().toLocaleLowerCase("tr-TR");
  document.querySelectorAll("#more .modulegrid button").forEach(b=>{
    b.classList.toggle("hidden",!!q&&!b.textContent.toLocaleLowerCase("tr-TR").includes(q));
  });
}
function quickModuleSearch(id){
  const input=$("moduleSearch");
  if(input){input.value=id;showView("more");filterModules();}
}
const originalShowView=showView;
showView=function(id){
  if(!$("dashboard")||!$(id))id="dashboard";
  currentWorkspaceView=id;
  originalShowView(id);
  syncWorkspace();
  window.scrollTo?.({top:0,behavior:"instant"});
};
const originalRender=render;
render=function(){
  originalRender();
  if(!unlocked)return;
  try{renderInventory();renderActivityLog();renderWorkflow();syncWorkspace();}
  catch(error){console.error("Workspace module failed",error);}
};
const previousFindings=getAuditFindings;
getAuditFindings=function(){
  const findings=previousFindings();
  const add=(severity,title,detail,view)=>findings.push({severity,title,detail,view});
  const p=scoped("products"),moves=scoped("stockMovements");
  for(const product of p){
    const qty=AccountingRules.stockQuantity(product,moves,db.activeCompanyId);
    if(qty< -0.0001)add("yüksek","Negatif stok",product.name+" miktarı "+qty,"inventory");
  }
  for(const doc of scoped("documents")){
    if(doc.documentType==="delivery_note"&&!doc.linkedInvoiceId){
      if(doc.items?.length)add("bilgi","Eşleştirilmemiş irsaliye",
        (doc.number||"Numarasız")+" • "+doc.items.length+" kalem","documents");
    }
    if(doc.stockApplied&&!moves.some(m=>m.sourceType==="delivery_note"&&Number(m.sourceId)===Number(doc.id))){
      add("yüksek","Stok kaydı eksik",doc.number||"Numarasız irsaliye","inventory");
    }
  }
  for(const v of scoped("vouchers")){
    const check=AccountingRules.balanceVoucher(v);
    if(v.entries?.length&&check.difference!==0&&
       !findings.some(x=>x.title==="Dengesiz muhasebe fişi"&&x.detail?.includes(v.voucherNo||"\uffff")))
      add("yüksek","Fiş denge kontrolü",(v.voucherNo||"Numarasız")+" fark: "+money(check.difference),"vouchers");
  }
  return findings;
};
