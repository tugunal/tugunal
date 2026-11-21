/* Akilli Muhasebe 1.0 – shared, side-effect-free accounting rules.
   All amounts represent TRY and remain estimates until a qualified accountant approves. */
(function(root){
  "use strict";
  const TWO=100;
  const round = value => Math.round((Number(value)||0)*TWO+Number.EPSILON)/TWO;
  const finitePositive = value => Number.isFinite(Number(value))&&Number(value)>0;
  const companyMatches=(row,companyId)=>Number(row?.companyId)===Number(companyId);
  const companyRows=(list,companyId)=>Array.isArray(list)?list.filter(row=>companyMatches(row,companyId)):[];
  function balanceVoucher(v){
    const entries=Array.isArray(v?.entries)?v.entries:[];
    if(entries.length<2)return {balanced:false,debit:0,credit:0,difference:0,reason:"Fiş en az iki hesap satırı içermeli."};
    let debit=0,credit=0;
    for(const e of entries){
      const d=Number(e.debit||0),c=Number(e.credit||0);
      if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||(d>0&&c>0)||(!d&&!c))
        return {balanced:false,debit:round(debit),credit:round(credit),difference:round(debit-credit),reason:"Geçersiz borç/alacak satırı."};
      debit+=d;credit+=c;
    }
    debit=round(debit);credit=round(credit);
    return {balanced:debit>0&&Math.abs(debit-credit)<=0.01,debit,credit,
      difference:round(debit-credit),reason:Math.abs(debit-credit)<=0.01?"":"Borç ve alacak toplamı eşit değil."};
  }
  function invoiceBalance(invoice){
    const total=round(invoice?.total||0),paid=round(invoice?.paidAmount||0);
    return {total,paid,remaining:round(Math.max(0,total-paid)),overpaid:paid>total+0.01};
  }
  function invoiceDuplicate(invoices,candidate,companyId,excludeId){
    const tax=(v)=>String(v??"").trim().replace(/\s+/g," ").toLocaleUpperCase("tr-TR");
    return companyRows(invoices,companyId).some(x=>
      Number(x.id)!==Number(excludeId||0)&&
      !!tax(candidate.number)&&tax(x.number)===tax(candidate.number)&&
      tax(x.party)===tax(candidate.party)&&
      (!candidate.date||!x.date||String(x.date)===String(candidate.date))
    );
  }
  function documentDuplicate(documents,candidate,companyId,excludeId){
    const norm=v=>String(v||"").trim().toLocaleUpperCase("tr-TR");
    return companyRows(documents,companyId).some(x=>
      Number(x.id)!==Number(excludeId||0)&&(
        (!!candidate.fingerprint&&x.fingerprint===candidate.fingerprint)||
        (!!candidate.number && x.documentType===candidate.documentType &&
          norm(x.number)===norm(candidate.number)&&norm(x.party)===norm(candidate.party)&&
          String(x.date||"")===String(candidate.date||""))
      ));
  }
  function stockQuantity(item,moves,companyId){
    if(!companyMatches(item,companyId))return 0;
    const opening=Number(item.openingQuantity||0);
    const delta=companyRows(moves,companyId)
      .filter(m=>Number(m.productId)===Number(item.id))
      .reduce((sum,m)=>sum+Number(m.quantity||0),0);
    return Math.round((opening+delta)*10000)/10000;
  }
  function movementAllowed(item,moves,companyId,quantity){
    const delta=Number(quantity);
    if(!item||!companyMatches(item,companyId)||!Number.isFinite(delta)||delta===0)
      return {ok:false,message:"Ürün ve miktar bilgisi geçersiz."};
    const balance=stockQuantity(item,moves,companyId);
    if(delta<0&&balance+delta< -0.0001)
      return {ok:false,message:"Yetersiz stok. Mevcut: "+balance};
    return {ok:true,before:balance,after:Math.round((balance+delta)*10000)/10000};
  }
  function deliveryPlan(doc,products,moves,companyId,direction){
    if(!doc||!companyMatches(doc,companyId)||doc.documentType!=="delivery_note")
      return {ok:false,error:"Geçerli bir irsaliye seç."};
    if(direction!=="in"&&direction!=="out")
      return {ok:false,error:"Giriş veya çıkış yönü seçilmeli."};
    const already=companyRows(moves,companyId).some(m=>m.sourceType==="delivery_note"&&Number(m.sourceId)===Number(doc.id));
    if(already||doc.stockApplied)return {ok:false,error:"Bu irsaliyenin stok işlemi zaten oluşturulmuş."};
    if(!Array.isArray(doc.items)||!doc.items.length)return {ok:false,error:"İrsaliyede ürün bulunmuyor."};
    const normalized=v=>String(v??"").trim().toLocaleUpperCase("tr-TR");
    const changes=new Map();
    const list=[];
    for(const row of doc.items){
      const quantity=Number(row.quantity);
      if(!Number.isFinite(quantity)||quantity<=0||!String(row.name||"").trim())return {ok:false,error:"İrsaliyede miktarı veya adı eksik ürün var."};
      const code=normalized(row.code),name=normalized(row.name);
      const product=companyRows(products,companyId).find(p=>
        (code&&normalized(p.code)===code)||(!code&&normalized(p.name)===name));
      const key=product?String(product.id):"new:"+(code||name);
      const delta=(direction==="in"?1:-1)*quantity;
      changes.set(key,(changes.get(key)||0)+delta);
      list.push({row,product,quantity:delta,key});
    }
    for(const [key,delta] of changes.entries()){
      const item=list.find(x=>x.key===key)?.product;
      const balance=item?stockQuantity(item,moves,companyId):0;
      if(direction==="out"&&balance+delta< -0.0001)return {ok:false,error:"Yetersiz stok: "+(item?.name||key)+" (mevcut "+balance+")"};
    }
    return {ok:true,lines:list,changes,companyId,direction};
  }
  function summarizeCompany(data,companyId){
    const transactions=companyRows(data?.transactions,companyId);
    const invoices=companyRows(data?.invoices,companyId);
    const docs=companyRows(data?.documents,companyId);
    const bank=companyRows(data?.bankRows,companyId);
    const income=round(transactions.filter(x=>x.type==="income").reduce((sum,x)=>sum+Number(x.amount||0),0));
    const expense=round(transactions.filter(x=>x.type==="expense").reduce((sum,x)=>sum+Number(x.amount||0),0));
    return {income,expense,cashDifference:round(income-expense),invoiceCount:invoices.length,
      documents:docs.length,deliveryNotes:docs.filter(x=>x.documentType==="delivery_note").length,
      unmatchedBank:bank.filter(x=>x.status==="unmatched").length};
  }
  root.AccountingRules={round,finitePositive,companyRows,balanceVoucher,invoiceBalance,
    invoiceDuplicate,documentDuplicate,stockQuantity,movementAllowed,deliveryPlan,summarizeCompany};
})(typeof window!=="undefined"?window:globalThis);
