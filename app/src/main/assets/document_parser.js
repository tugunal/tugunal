/* Akilli Muhasebe 0.9: Turkish document/receipt line-item interpretation. Offline. */
(function(root){
"use strict";
function up(s){return String(s??"").toLocaleUpperCase("tr-TR").replace(/[İI]/g,"I").replace(/Ğ/g,"G").replace(/Ş/g,"S").replace(/Ü/g,"U").replace(/Ö/g,"O").replace(/Ç/g,"C");}
function compact(s){return up(s).replace(/\s+/g," ").trim();}
function number(s){s=String(s??"").replace(/[₺\s]|TL/ig,"").replace(/[^0-9.,+-]/g,"");if(!/\d/.test(s))return NaN;const c=s.lastIndexOf(","),d=s.lastIndexOf(".");if(c>=0&&d>=0)s=c>d?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");else if(c>=0)s=s.replace(/\./g,"").replace(",",".");else if(d>=0&&/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,"");else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,"");return Number(s);}
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
function date(s){const m=String(s??"").match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/);if(!m)return "";const day=Number(m[1]),mon=Number(m[2]),year=Number(m[3]),d=new Date(Date.UTC(year,mon-1,day));return d.getUTCDate()===day&&d.getUTCMonth()===mon-1?year+"-"+String(mon).padStart(2,"0")+"-"+String(day).padStart(2,"0"):"";}
function tokenAfter(lines,labels){for(const label of labels){for(const original of lines){const line=up(original).replace(/\*/g," "),at=line.indexOf(up(label));if(at<0)continue;let rest=line.slice(at+label.length).replace(/^\s*[:\-]?\s*/,"");const matches=[...rest.matchAll(/[+-]?\d{1,3}(?:[.\s]\d{3})+(?:,\d{2})?|[+-]?\d+(?:,\d{2}|\.\d{2})/g)].filter(x=>!/%/.test(rest.slice(Math.max(0,x.index-2),x.index)));if(matches.length){const n=number(matches[matches.length-1][0]);if(Number.isFinite(n)&&n>=0)return round(n);}}}return null;}
function first(text,patterns){for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim();}return "";}
function rowsFromPositions(lines){if(!Array.isArray(lines))return [];const arr=lines.filter(x=>x&&x.text&&Number.isFinite(Number(x.x))&&Number.isFinite(Number(x.y))).map(x=>({...x,x:Number(x.x),y:Number(x.y),height:Math.max(8,Number(x.height)||16)})).sort((a,b)=>a.y-b.y||a.x-b.x);if(!arr.length)return [];const heights=arr.map(x=>x.height).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)]||16,rows=[];for(const line of arr){const center=line.y+line.height/2;let group=rows[rows.length-1];if(!group||Math.abs(group.center-center)>Math.max(6,median*.65)){group={center,cells:[]};rows.push(group);}group.cells.push(line);}return rows.map(r=>r.cells.sort((a,b)=>a.x-b.x).map(x=>String(x.text).trim()).join(" ").replace(/\s+/g," ").trim()).filter(Boolean);}
function itemsFromLines(lines){const result=[];const junk=/^(TOPKDV|TOP\b|KDV\b|ARATOPLAM|ARA TOPLAM|GENEL TOPLAM|ODENECEK|ÖDENECEK|EFT|BANKA|POS|BATCH|SATIŞ|SATIS|VERG[Iİ]|TAR[Iİ]H|F[Iİ]S NO|FI[SŞ] NO|SAAT|VKN|SAYIN|SIRA NO|S\.NO|MAL H[Iİ]ZMET|M[Iİ]KTAR|S[Iİ]FRE|KART)/i;
const unit="ADET|AD|PKT|PAKET|KOLI|KOLİ|KG|GR|LT|L|M2|M²|M3|M³|MT|METRE|KUTU|ÇUVAL|CUVAL";
const material=new RegExp("^(?:\\d{1,3}\\s+)?([A-Z0-9]{3,12})\\s+(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*("+unit+")\\s+([\\d.,]+)\\s+([\\d.,]+)\\s*$","iu");
const qtyReg=new RegExp("\\b(\\d+(?:[.,]\\d+)?)\\s*("+unit+")\\b","iu");
const receipt=/^(.+?)\s+(?:[/\\]?\s*%)(\d{1,2})\s*\*?\s*([+-]?\d[\d.,]*)(?:\s*(?:TL|₺))?\s*$/iu;
for(const raw of lines){const line=String(raw??"").replace(/\s+/g," ").trim();if(!line||line.length>330||junk.test(compact(line)))continue;
let m=line.match(material);if(m){const qty=number(m[3]),unitPrice=number(m[5]),amount=number(m[6]);if(qty>0&&Number.isFinite(unitPrice)&&amount>=0){result.push({code:m[1],name:m[2].replace(/\b(gitti|teslim)\b/gi,"").trim().slice(0,180),quantity:qty,unit:m[4].toUpperCase(),unitPrice:round(unitPrice),amount:round(amount),vatRate:null});continue;}}
m=line.match(receipt);if(m){let name=m[1].trim(),qty=1;const qm=name.match(/^(\d+)\s*[X×]\s+(.+)$/i);if(qm){qty=Number(qm[1]);name=qm[2];}const amount=number(m[3]),vatRate=Number(m[2]);if(amount>=0&&qty>0&&vatRate<=30&&name.length>=2){result.push({code:"",name,quantity:qty,unit:"ADET",unitPrice:round(amount/qty),amount:round(amount),vatRate});continue;}}
m=line.match(qtyReg);if(m&&m.index>0){let name=line.slice(0,m.index).replace(/^\d{1,3}\s+/,"").trim();const tail=line.slice(m.index+m[0].length);const amounts=tail.match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?(?:\s*(?:TL|₺))?/g)||[];const values=amounts.map(number).filter(Number.isFinite);if(name.length>=2&&values.length>=2){const qty=number(m[1]),price=values[0],vatMatch=tail.match(/%\s*(\d{1,2})/),vatRate=vatMatch?Number(vatMatch[1]):null;let amount=round(qty*price);const last=values[values.length-1];if(values.length>=3&&Math.abs(last-amount)<Math.max(.15,amount*.005))amount=round(last);if(qty>0&&price>=0)result.push({code:/^[A-Z0-9-]+$/i.test(name)?name:"",name,quantity:qty,unit:m[2].toUpperCase(),unitPrice:round(price),amount,vatRate});}}
}
return result;
}
function grouped(items){const out=[],index=new Map();for(const x of items){const key=[compact(x.code),compact(x.name),x.unit,x.unitPrice,x.vatRate].join("|");if(index.has(key)){const old=out[index.get(key)];old.quantity=round(old.quantity+x.quantity);old.amount=round(old.amount+x.amount);}else{index.set(key,out.length);out.push({...x});}}return out.slice(0,120);}
function parseDocument(text,positionedLines){if(typeof text!=="string"||text.length>180000)throw Error("Belge metni çok uzun.");const lines=text.replace(/\r/g,"").split(/\n/).map(x=>x.trim()).filter(Boolean),normal=lines.map(compact).join("\n"),layout=rowsFromPositions(positionedLines);
const hasFatura=/E[\s-]?FATURA|E[\s-]?ARSIV|FATURA NO|FATURA NUMARASI/.test(normal),hasReceipt=/FIS NO|ARATOPLAM|TOPKDV|EFT-POS/.test(normal),hasMaterial=/S\.NO KODU|SIRA NO KODU|PE[SŞ]IN SATI[SŞ]LAR|URUN ADI/.test(normal),hasPOS=/POS|BATCH|ONAY KODU|ISLEM TUTARI/.test(normal);
const type=hasFatura?"einvoice":hasReceipt?"receipt":(/IRSALIYE|İRSALİYE/.test(normal)||hasMaterial)?"delivery_note":hasPOS?"pos":/FATURA|MAL HIZMET/.test(normal)?"invoice":"unknown";
const nameLabels={einvoice:"e-Fatura / e-Arşiv",receipt:"Market/perakende fişi",delivery_note:"İrsaliye (malzeme ve ürün listesi)",pos:"POS ödeme slipi",invoice:"Fatura",unknown:"Belge"};
const docDate=date(first(text,[/(?:FATURA\s*TAR[Iİ]H[Iİ]|BELGE\s*TAR[Iİ]H[Iİ])\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]20\d{2})/i,/\b(\d{1,2}[.\/-]\d{1,2}[.\/-]20\d{2})\b/]));
const time=first(text,[/(?:SAAT|FATURA SAAT[Iİ])\s*[:\-]?\s*(\d{1,2}:\d{2}(?::\d{2})?)/i]);
const numberString=first(text,[/(?:FATURA\s*(?:NO|NUMARASI))\s*[:\-]?\s*([A-Z0-9\/-]{4,32})/i,/(?:F[Iİ]Ş|FI[SŞ])\s*NO\s*[:\-]?\s*([A-Z0-9\/-]{2,32})/i,/(?:BELGE|DEKONT)\s*NO\s*[:\-]?\s*([A-Z0-9\/-]{3,32})/i]);
const taxNo=first(text,[/(?:VKN|VERG[Iİ]\s*(?:K[Iİ]ML[Iİ]K\s*)?(?:NO|NUMARASI)|TCKN)\s*[:\-]?\s*(\d{10,11})/i,/(?:V\.?\s*D\.?|VERG[Iİ]\s*DA[Iİ]RES[Iİ])\.?\s*\n?\s*(\d{10,11})/i]);
let total=tokenAfter(lines,["ÖDENECEK TUTAR","ODENECEK TUTAR","VERGİLER DAHİL TOPLAM TUTAR","VERGILER DAHIL TOPLAM TUTAR","GENEL TOPLAM","TOPLAM TUTAR","TOPLAM","TOP"]),vat=tokenAfter(lines,["HESAPLANAN KDV","TOPKDV","TOPLAM KDV","KDV"]),net=tokenAfter(lines,["MAL HİZMET TOPLAM TUTAR","MAL HIZMET TOPLAM TUTAR","VERGİ HARİÇ TOPLAM TUTAR","ARA TOPLAM","ARATOPLAM","MATRAH"]),posAmount=tokenAfter(lines,["İŞLEM TUTARI","ISLEM TUTARI","EFT-POS","TEK POS"]);
if(type==="pos"&&total==null)total=posAmount;
if(total==null&&type==="receipt")total=tokenAfter(lines,["ARATOPLAM","ARA TOPLAM"]);
if(total==null&&layout.length)total=tokenAfter(layout,["ÖDENECEK TUTAR","GENEL TOPLAM","TOPLAM"]);
const rawItems=itemsFromLines(lines),layoutItems=itemsFromLines(layout);
const items=grouped(layoutItems.length>rawItems.length?layoutItems:rawItems),itemSum=round(items.reduce((s,i)=>s+i.amount,0));
if(total==null&&type==="delivery_note"&&itemSum>0)total=itemSum;
const rates=[...new Set(items.map(i=>i.vatRate).filter(x=>x!==null))];let vatRate=rates.length===1?rates[0]:null;
if(vatRate===null&&type!=="delivery_note"&&type!=="pos"){const r=normal.match(/(?:KDV ORANI|HESAPLANAN KDV)\s*[:(]?\s*%?\s*(\d{1,2})/);if(r)vatRate=Number(r[1]);}
if(total==null&&net!==null&&vat!==null)total=round(net+vat);
if(net===null&&total!==null&&vat!==null)net=round(total-vat);
if(net===null&&type==="einvoice"&&itemSum>0)net=itemSum;
if(type==="delivery_note")net=null; // Never infer tax base from delivery note
if(type==="receipt"&&total!==null&&vat!==null)net=round(total-vat);
if(type==="receipt"&&total!==null&&vat===null&&vatRate!==null){vat=round(total-total/(1+vatRate/100));net=round(total-vat);}
if(vat===null&&total!==null&&net!==null&&type!=="delivery_note"&&type!=="pos"&&total>=net)vat=round(total-net);
if(total===null&&net!==null)total=net;
const vendorCandidates=lines.slice(0,20).filter(x=>x.length>4&&x.length<95&&/[A-ZÇĞİÖŞÜ]{3}/i.test(x)&&!/^(SAYIN|FATURA|FI[SŞ]|SAAT|TAR[Iİ]H|VERG[Iİ]|VKN|TEL|ADRES|MERS[Iİ]S|OZELLE[SŞ]T[Iİ]RME|MAL H[Iİ]ZMET|TOPLAM|S\.NO|SIRA)/i.test(compact(x))&&!/^\d+[.\/-]/.test(x));
let party=vendorCandidates.find(x=>/MARKET|YAZILIM|LTD|A\.?S\.?|A\.?Ş\.?|TEKNOLOJ[Iİ]|T[Iİ]CARET/i.test(compact(x)))||vendorCandidates[0]||"";
if(type==="delivery_note")party=party&&/^(?:\d+\s+[A-Z0-9-]+|PE[SŞ]IN SATI[SŞ]LAR)/i.test(party)?"":party;
const payment=/EFT-POS|TEK POS|KRED[Iİ] KART[Iİ]|HALKBANK|ONAY KODU/.test(normal)?"card":/\bNAK[Iİ]T\b/.test(normal)?"cash":"unknown";
const warnings=[];if(!docDate)warnings.push("Tarih okunamadı.");if(!numberString)warnings.push("Belge numarası doğrulanamadı.");
if(type==="delivery_note")warnings.push("İrsaliye fatura değildir. KDV veya gider kaydı doğrudan oluşturulmaz; faturayla eşleştirilebilir.");
if(type==="pos")warnings.push("POS slipini alışveriş fişiyle birlikte ikinci kez gider olarak kaydetmeyin.");
if((type==="receipt"||type==="einvoice"||type==="invoice")&&vat===null)warnings.push("KDV bilgisi okunamadı.");
if(!items.length)warnings.push("Ürün kalemleri net okunamadı; elle ekleyin.");
if(total===null)warnings.push("Toplam tutar okunamadı.");
if(items.length&&total!==null&&(type==="delivery_note"||type==="receipt")&&Math.abs(itemSum-total)>.06)warnings.push("Ürün toplamı ile belge toplamı uyuşmuyor; iskonto veya OCR hatası olabilir.");
if(net!==null&&vat!==null&&total!==null&&Math.abs(round(net+vat)-total)>.06)warnings.push("Matrah + KDV ile belge toplamı uyuşmuyor.");
if(hasReceipt&&hasPOS&&total!==null&&posAmount!==null)warnings.push(Math.abs(total-posAmount)<.06?"POS tutarı fiş ile aynı; iki kez ödeme/gider oluşmamalı.":"POS tutarı ve fiş toplamı farklı.");
let hash=2166136261;const canonical=lines.map(compact).join(" ").slice(0,80000);for(let i=0;i<canonical.length;i++){hash^=canonical.charCodeAt(i);hash=Math.imul(hash,16777619);}
return {documentType:type,documentTypeLabel:nameLabels[type],number:numberString,party,taxNo,date:docDate,time,payment,net,vat,vatRate,total,posAmount,items,itemSum,warnings,rawText:text,fingerprint:"ocr-"+(hash>>>0).toString(16),needsReview:true,verified:false};
}
const api={parseDocument,number,date,rowsFromPositions};
root.DocumentParser=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
