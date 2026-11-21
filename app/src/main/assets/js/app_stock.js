/* Akilli Muhasebe 1.0 — inventory and delivery-note operations.
   No tax postings are made by any of these functions. */
"use strict";
function stockLog(action,detail,sourceId){
  if(!Array.isArray(db.activityLog))db.activityLog=[];
  db.activityLog.unshift({
    id:newRecordId(),companyId:db.activeCompanyId,action,
    detail:String(detail||"").slice(0,240),sourceId:sourceId||0,
    at:new Date().toISOString()
  });
  if(db.activityLog.length>1500)db.activityLog.length=1500;
}
function stockSafe(){
  if(!unlocked)return false;
  if(readOnlyRecovery){NativeStore.showMessage("Veri koruma modunda değişiklik yapılamaz.");return false;}
  return true;
}
function stockProductById(id){return scoped("products").find(p=>Number(p.id)===Number(id));}
function stockOnHand(p){return AccountingRules.stockQuantity(p,db.stockMovements,db.activeCompanyId);}
function stockNumber(value){const n=DocumentParser?.number?DocumentParser.number(value):Number(value);return Number.isFinite(n)?n:NaN;}
function saveStockProduct(event){
  event?.preventDefault();
  if(!stockSafe())return false;
  const name=$("stockProductName").value.trim(),code=$("stockProductCode").value.trim(),
    unit=$("stockProductUnit").value.trim()||"ADET";
  const price=stockNumber($("stockProductPrice").value||"0"),
    opening=stockNumber($("stockProductOpening").value||"0");
  if(name.length<2||name.length>150)return NativeStore.showMessage("Ürün adı 2-150 karakter olmalı."),false;
  if(!Number.isFinite(price)||price<0||!Number.isFinite(opening)||opening<0)
    return NativeStore.showMessage("Fiyat ve açılış stoku geçersiz."),false;
  if(code&&scoped("products").some(p=>String(p.code).toLocaleLowerCase("tr-TR")===code.toLocaleLowerCase("tr-TR")))
    return NativeStore.showMessage("Bu stok kodu zaten kayıtlı."),false;
  const p={id:newRecordId(),companyId:db.activeCompanyId,name,code:code.slice(0,40),
    unit:unit.slice(0,24),openingQuantity:opening,unitPrice:price,createdAt:new Date().toISOString()};
  db.products.unshift(p);
  stockLog("stok_urun",name+" ürün kartı oluşturuldu.",p.id);
  if(!persist())return false;
  $("stockProductForm").reset();
  NativeStore.showMessage("Ürün kartı kaydedildi.");
  return false;
}
function recordStockMovement(event){
  event?.preventDefault();
  if(!stockSafe())return false;
  const product=stockProductById($("stockMoveProduct").value);
  const raw=stockNumber($("stockMoveQuantity").value);
  const operation=$("stockMoveDirection").value;
  const date=$("stockMoveDate").value||dateToday();
  const note=$("stockMoveNote").value.trim().slice(0,180);
  if(!product||!(raw>0)||!["in","out"].includes(operation))
    return NativeStore.showMessage("Ürün, işlem türü ve pozitif miktar girin."),false;
  const quantity=operation==="in"?raw:-raw;
  const validation=AccountingRules.movementAllowed(product,db.stockMovements,db.activeCompanyId,quantity);
  if(!validation.ok)return NativeStore.showMessage(validation.message),false;
  if(!confirm(product.name+" için "+raw+" "+product.unit+" "+
      (operation==="in"?"giriş":"çıkış")+" kaydedilsin mi?"))return false;
  const move={id:newRecordId(),companyId:db.activeCompanyId,productId:product.id,
    date,quantity,unitPrice:Number(product.unitPrice||0),description:note||"Manuel stok işlemi",
    sourceType:"manual",sourceId:0};
  db.stockMovements.unshift(move);
  stockLog("stok_hareketi",product.name+" için "+quantity+" "+product.unit+" hareket.",move.id);
  if(!persist())return false;
  $("stockMoveForm").reset();
  NativeStore.showMessage("Stok hareketi kaydedildi.");
  return false;
}
function applyDeliveryStock(){
  if(!stockSafe())return;
  const docId=$("stockDeliverySelect").value,operation=$("stockDeliveryDirection").value;
  const doc=scoped("documents").find(x=>Number(x.id)===Number(docId));
  const plan=AccountingRules.deliveryPlan(doc,db.products,db.stockMovements,db.activeCompanyId,operation);
  if(!plan.ok)return NativeStore.showMessage(plan.error);
  const directionName=operation==="in"?"stok girişine":"stok çıkışına";
  if(!confirm((doc.number||"Numarasız")+" irsaliyesindeki "+plan.lines.length+
      " satır "+directionName+" aktarılacak. Bu işlem fatura veya KDV kaydı oluşturmaz. Onaylıyor musun?"))return;
  const createdProductByKey=new Map(),moves=[];
  for(const line of plan.lines){
    let p=line.product;
    if(!p){
      p=createdProductByKey.get(line.key);
      if(!p){
        p={id:newRecordId(),companyId:db.activeCompanyId,
          name:String(line.row.name).slice(0,150),code:String(line.row.code||"").slice(0,40),
          unit:String(line.row.unit||"ADET").slice(0,24),openingQuantity:0,
          unitPrice:Number(line.row.unitPrice||0),createdAt:new Date().toISOString()};
        createdProductByKey.set(line.key,p);
        db.products.unshift(p);
      }
    }
    moves.push({id:newRecordId(),companyId:db.activeCompanyId,productId:p.id,
      quantity:line.quantity,unitPrice:Number(line.row.unitPrice||p.unitPrice||0),
      date:doc.date||dateToday(),description:"İrsaliye: "+(doc.number||"Numarasız"),
      sourceType:"delivery_note",sourceId:doc.id});
  }
  db.stockMovements.unshift(...moves);
  doc.stockApplied={direction:operation,at:new Date().toISOString(),movementIds:moves.map(x=>x.id)};
  stockLog("irsaliye_stok",(doc.number||"Numarasız")+" irsaliye "+moves.length+" stok satırına aktarıldı.",doc.id);
  if(!persist())return;
  NativeStore.showMessage("İrsaliye stoka aktarıldı. Mali fiş oluşturulmadı.");
}
function renderInventory(){
  if(!$("stockProductList"))return;
  const products=scoped("products"),moves=scoped("stockMovements"),
    notes=scoped("documents").filter(d=>d.documentType==="delivery_note"&&!d.stockApplied &&
      !moves.some(m=>m.sourceType==="delivery_note"&&Number(m.sourceId)===Number(d.id)));
  const qty=products.reduce((s,p)=>s+stockOnHand(p),0);
  const negative=products.filter(p=>stockOnHand(p)<-0.0001).length;
  $("stockProductCount").textContent=String(products.length);
  $("stockTotalQuantity").textContent=Number(qty.toFixed(3)).toLocaleString("tr-TR");
  $("stockWarnings").textContent=negative?negative+" ürün stok açığı gösteriyor.":"Stok miktarları izleniyor.";
  const sel=$("stockMoveProduct"),selected=sel.value;
  sel.innerHTML='<option value="">Ürün seç</option>'+products.map(p=>
    '<option value="'+p.id+'">'+esc(p.name)+(p.code?' • '+esc(p.code):'')+'</option>').join("");
  if(products.some(p=>String(p.id)===selected))sel.value=selected;
  $("stockMoveDate").value=$("stockMoveDate").value||dateToday();
  const deliverySelect=$("stockDeliverySelect"),selectedDoc=deliverySelect.value;
  deliverySelect.innerHTML='<option value="">İrsaliye seç</option>'+notes.map(d=>
    '<option value="'+d.id+'">'+esc(d.number||"Numarasız")+" • "+esc(d.party||"Satıcı yok")+
    ' • '+(d.items?.length||0)+' kalem</option>').join("");
  if(notes.some(d=>String(d.id)===selectedDoc))deliverySelect.value=selectedDoc;
  $("stockProductList").innerHTML=products.map(p=>{
    const balance=stockOnHand(p);
    return '<div class="row"><div style="min-width:0;flex:1"><b>'+esc(p.name)+'</b>'+
      '<div class="muted">'+esc(p.code||"Kodsuz")+" • "+esc(p.unit)+" • Birim maliyet (girilen) "+money(p.unitPrice||0)+
      '</div></div><b class="'+(balance<0?"negative":"positive")+'">'+
      Number(balance.toFixed(3)).toLocaleString("tr-TR")+" "+esc(p.unit)+"</b></div>";
  }).join("")||'<div class="empty">Henüz stok kartı yok. Ürün ekleyebilir veya irsaliyeyi stoka aktarabilirsin.</div>';
  const lookup=new Map(products.map(p=>[Number(p.id),p]));
  $("stockMovementList").innerHTML=moves.slice(0,90).map(m=>{
    const product=lookup.get(Number(m.productId));
    return '<div class="row"><div style="min-width:0;flex:1"><b>'+esc(product?.name||"Silinmiş ürün")+'</b>'+
      '<div class="muted">'+esc(m.date||"")+" • "+esc(m.description||"")+
      " • "+(m.sourceType==="delivery_note"?"İrsaliye":"Manuel")+
      '</div></div><b class="'+(Number(m.quantity)>=0?"positive":"negative")+'">'+
      (Number(m.quantity)>0?"+":"")+Number(m.quantity).toLocaleString("tr-TR")+
      "</b></div>";
  }).join("")||'<div class="empty">Henüz stok hareketi yok.</div>';
}
function renderActivityLog(){
  if(!$("activityLog"))return;
  const entries=scoped("activityLog").slice(0,100);
  $("activityLog").innerHTML=entries.map(x=>'<div class="row"><div><b>'+
    esc(x.action.replaceAll("_"," "))+'</b><div class="muted">'+
    esc(x.detail)+" • "+esc((x.at||"").replace("T"," ").slice(0,16))+
    '</div></div></div>').join("")||'<div class="empty">Yeni işlem geçmişi henüz boş.</div>';
}
