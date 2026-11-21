/* Offline-only UBL-TR invoice XML reader. Creates a reviewable draft, never a signed/electronic submission. */
(function(root){
"use strict";
const round=n=>Math.round((Number(n)||0)*100+Number.EPSILON)/100;
const txt=n=>n?String(n.textContent||"").trim():"";
const direct=(n,name)=>n?Array.from(n.children||[]).find(c=>c.localName===name)||null:null;
const desc=(n,name)=>n?Array.from(n.getElementsByTagName("*")).find(c=>c.localName===name)||null:null;
const dirText=(n,name)=>txt(direct(n,name));
const deepText=(n,name)=>txt(desc(n,name));
function money(value){
 const n=Number(String(value||"").replace(",","."));
 return Number.isFinite(n)?round(n):null;
}
function parseInvoice(xml){
 if(typeof xml!=="string"||!xml.trim()||xml.length>5_000_000)throw Error("XML boş veya 5 MB sınırını aşıyor.");
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error("Güvenlik nedeniyle DTD/ENTITY içeren XML desteklenmiyor.");
 if(typeof DOMParser!=="function")throw Error("Bu Android sürümünde XML ayrıştırıcı yok.");
 const doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.getElementsByTagName("parsererror").length)throw Error("XML biçimi geçersiz.");
 const inv=doc.documentElement;
 if(inv.localName!=="Invoice"||!String(inv.namespaceURI||"").includes("oasis:names:specification:ubl"))
   throw Error("UBL-TR e-Fatura/e-Arşiv XML belgesi seçilmeli.");
 const number=dirText(inv,"ID").slice(0,64),date=dirText(inv,"IssueDate").slice(0,10);
 const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:"";
 const time=dirText(inv,"IssueTime").slice(0,8);
 const uuid=dirText(inv,"UUID").slice(0,80);
 const currency=dirText(inv,"DocumentCurrencyCode")||"TRY";
 const supplier=direct(inv,"AccountingSupplierParty");
 const partyNode=direct(supplier,"Party");
 const partyName=deepText(direct(partyNode,"PartyName"),"Name") ||
                 deepText(direct(partyNode,"PartyLegalEntity"),"RegistrationName") ||
                 deepText(direct(partyNode,"Person"),"FirstName");
 const ids=partyNode?Array.from(partyNode.getElementsByTagName("*")).filter(x=>x.localName==="ID"):[];
 const taxNode=ids.find(x=>["VKN","TCKN"].includes(String(x.getAttribute("schemeID")||"").toUpperCase()));
 const taxNo=taxNode?txt(taxNode):ids.map(txt).find(x=>/^\d{10,11}$/.test(x))||"";
 const amounts=direct(inv,"LegalMonetaryTotal");
 const net=money(dirText(amounts,"TaxExclusiveAmount")||dirText(amounts,"LineExtensionAmount"));
 const total=money(dirText(amounts,"PayableAmount")||dirText(amounts,"TaxInclusiveAmount"));
 const totalTax=direct(inv,"TaxTotal");
 const vat=money(dirText(totalTax,"TaxAmount"));
 const vatPercent=deepText(totalTax,"Percent");
 const lines=Array.from(inv.children||[]).filter(x=>x.localName==="InvoiceLine");
 const items=[];
 const rates=new Set();
 for(const l of lines.slice(0,250)){
   const item=direct(l,"Item"),price=direct(l,"Price");
   const qtyNode=direct(l,"InvoicedQuantity");
   const q=Number(txt(qtyNode).replace(",","."));
   const unitCode=qtyNode?.getAttribute("unitCode")||"C62";
   const u=({C62:"ADET",KGM:"KG",LTR:"LT",MTR:"MT",MTK:"M2",BX:"KUTU",PK:"PKT"})[unitCode]||unitCode;
   const name=deepText(item,"Name")||deepText(item,"Description")||"Ürün / hizmet";
   const code=deepText(direct(item,"SellersItemIdentification"),"ID");
   const unitPrice=money(dirText(price,"PriceAmount"));
   const amount=money(dirText(l,"LineExtensionAmount"));
   const subtotal=desc(l,"TaxSubtotal");
   const rate=money(dirText(subtotal,"Percent"));
   if(rate!==null)rates.add(rate);
   items.push({code:code.slice(0,42),name:name.slice(0,200),
     quantity:Number.isFinite(q)&&q>0?q:1,unit:u.slice(0,30),
     unitPrice:unitPrice===null?0:unitPrice,amount:amount===null?0:amount,vatRate:rate});
 }
 if(!items.length)throw Error("UBL faturada mal/hizmet kalemi bulunamadı.");
 const warnings=["Bu belge yalnızca XML'den okunan taslaktır. GİB doğrulaması, imza kontrolü ve resmî gönderim yapılmadı."];
 if(!validDate)warnings.push("Fatura tarihi eksik veya geçersiz.");
 if(!number)warnings.push("Fatura numarası bulunamadı.");
 if(currency!=="TRY")warnings.push("Belge para birimi "+currency+". Türk lirasına çevrilmedi.");
 if(rates.size>1)warnings.push("Birden fazla KDV oranı mevcut. Tek oranlı taslak uygun olmayabilir.");
 if(net!==null&&vat!==null&&total!==null&&Math.abs(round(net+vat)-total)>0.06)
   warnings.push("Matrah + vergi ile toplam farklı. İndirim, tevkifat veya ek vergileri kontrol edin.");
 const fingerprint="ubl-"+(uuid||number+"|"+validDate+"|"+taxNo).slice(0,120);
 return {documentType:"einvoice",documentTypeLabel:"UBL-TR XML e-Fatura / e-Arşiv",
   number,party:partyName.slice(0,140),taxNo,date:validDate,time,payment:"unknown",
   net,vat,total,vatRate:rates.size===1?Array.from(rates)[0]:(vatPercent?money(vatPercent):null),
   currency,items,itemSum:round(items.reduce((sum,x)=>sum+(Number(x.amount)||0),0)),
   rawText:xml.slice(0,180000),warnings,fingerprint,sourceFormat:"UBL-XML",
   verified:false,needsReview:true};
}
root.UBLParser={parseInvoice};
if(typeof module!=="undefined"&&module.exports)module.exports={parseInvoice};
})(typeof window!=="undefined"?window:globalThis);
