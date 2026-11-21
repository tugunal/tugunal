const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('app/src/main/assets/document_parser.js','utf8');
new Function(code);
const ctx = vm.createContext({window:{},Date,Math,Number,String,Array,Set,Map,Intl});
vm.runInContext(code,ctx);
const parser = ctx.window.DocumentParser;
assert.ok(parser && typeof parser.parseDocument === 'function');

const receipt = [
 '9147 ÖRNEK MARKET','Örnek İşletme','Elbistan V.D.','1234567890',
 '21-11-2026 FİŞ NO: 0033','SAAT 10:44','EKMEK %01 *15,00',
 'EKMEK %01 *15,00','EKMEK %01 *15,00','ARATOPLAM *45,00',
 'KDV *0,45','TOP *45,00','EFT-POS *45,00','İŞLEM TUTARI 45,00 TL'
].join('\n');
const receiptDoc=parser.parseDocument(receipt);
assert.equal(receiptDoc.documentType,'receipt');
assert.equal(receiptDoc.number,'0033');
assert.equal(receiptDoc.date,'2026-11-21');
assert.equal(receiptDoc.total,45);
assert.equal(receiptDoc.vat,0.45);
assert.equal(receiptDoc.net,44.55);
assert.equal(receiptDoc.items.length,1);
assert.equal(receiptDoc.items[0].name,'EKMEK');
assert.equal(receiptDoc.items[0].quantity,3);
assert.equal(receiptDoc.items[0].amount,45);
assert.ok(receiptDoc.warnings.some(x=>x.includes('POS')));

const einvoice = [
 'ÖRNEK YAZILIM A.Ş.','e-FATURA','Fatura No: ORN2024000000001','Fatura Tarihi: 12-06-2024',
 'VKN: 1111111111','1 CİHAZ-1 1 Adet 50.000 TL %20 10.000,00 TL 50.000,00 TL',
 'Mal Hizmet Toplam Tutarı 50.000,00 TL','Hesaplanan KDV(%20) 10.000,00 TL',
 'Vergiler Dahil Toplam Tutar 60.000,00 TL','Ödenecek Tutar 60.000,00 TL'
].join('\n');
const invoiceDoc=parser.parseDocument(einvoice);
assert.equal(invoiceDoc.documentType,'einvoice');
assert.equal(invoiceDoc.total,60000);
assert.equal(invoiceDoc.net,50000);
assert.equal(invoiceDoc.vat,10000);
assert.equal(invoiceDoc.items.length,1);
assert.equal(invoiceDoc.items[0].quantity,1);
assert.equal(invoiceDoc.items[0].unitPrice,50000);
assert.equal(invoiceDoc.items[0].vatRate,20);

const deliveryNote = [
 'PEŞİN SATIŞLAR 2026/2','S.NO KODU ÜRÜN ADI MİKTAR FİYAT TUTAR',
 '1 FWR5 KARBONLU ISI YALITIM LEVHASI 5M2 70 PKT 1.070,00 74.900,00',
 '2 FIYS ISI YALITIM SIVASI 25KG 63 ADET 245,00 15.435,00',
 '3 FIYY YALITIM YAPIŞTIRICISI 25KG 63 ADET 225,00 14.175,00',
 '4 711007 DEKORATİF MİNERAL KAPLAMA 25KG 28 ADET 340,00 9.520,00',
 '5 FWF160 DONATI YALITIM FİLESİ 50M2 7 ADET 1.650,00 11.550,00',
 '6 FWFK YALITIM KÖŞEBENTİ 2,5MT 35 ADET 65,00 2.275,00',
 '7 FYD115 MANTOLAMA DÜBELİ 11,5CM 2100 ADET 2,50 5.250,00',
 '8 FWR2 ISI YALITIM LEVHASI 2CM 1 PKT 1.200,00 1.200,00',
 '9 KT109 HAZIR KÖŞE TAŞI 56 ADET 140,00 7.840,00',
 '10 BDK3289 BRÜT BETON ASTARI 12KG 3 ADET 630,00 1.890,00',
 'Genel Toplam: ₺144.035,00','31 adet şaşırtmadı gitti'
].join('\n');
const noteDoc=parser.parseDocument(deliveryNote);
assert.equal(noteDoc.documentType,'delivery_note');
assert.equal(noteDoc.items.length,10);
assert.equal(noteDoc.itemSum,144035);
assert.equal(noteDoc.total,144035);
assert.equal(noteDoc.net,null);
assert.equal(noteDoc.vat,null);
assert.equal(noteDoc.items[0].code,'FWR5');
assert.equal(noteDoc.items[0].quantity,70);
assert.equal(noteDoc.items[6].quantity,2100);
assert.equal(noteDoc.date,'');
assert.ok(noteDoc.warnings.some(x=>x.includes('İrsaliye')));

const namedNote=parser.parseDocument(['SEVK İRSALİYESİ','IRSALIYE NO: 1234',
 'KODU ÜRÜN ADI','1 FWR5 LEVHA 1 ADET 5,00 5,00','GENEL TOPLAM 5,00'].join('\n'));
assert.equal(namedNote.documentType,'delivery_note');

const pos=parser.parseDocument(['ÖRNEK BANKA POS','SATIŞ',
 'İŞLEM TUTARI 45,00 TL','ONAY KODU 046993','21.11.2026'].join('\n'));
assert.equal(pos.documentType,'pos');
assert.equal(pos.total,45);
assert.equal(pos.vat,null);
assert.equal(pos.items.length,0);

const rows=parser.rowsFromPositions([
  {text:'100,00',x:420,y:103,height:16},
  {text:'TUTAR',x:380,y:40,height:16},
  {text:'ÜRÜN A',x:10,y:101,height:16},
  {text:'TARİH',x:10,y:39,height:16}
]);
assert.ok(rows[0].includes('TARİH') && rows[0].includes('TUTAR'));
assert.ok(rows[1].includes('ÜRÜN A') && rows[1].includes('100,00'));
assert.ok(!/fetch\s*\(|XMLHttpRequest|addTransactionVoucher|saveData\(/.test(code));
console.log('PASS: receipt, POS, e-invoice, 10-item delivery note, totals, reading order and offline parsing');
