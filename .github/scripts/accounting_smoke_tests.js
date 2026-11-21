const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const page = fs.readFileSync("app/src/main/assets/index.html", "utf8");
const match = page.match(/<script>([\s\S]+?)<\/script>/);
assert.ok(match, "app JavaScript not found");
new Function(match[1]);

const dom = new Map();
function element(id) {
  if (!dom.has(id)) {
    const cls = new Set();
    dom.set(id, {
      id, value: "", textContent: "", innerHTML: "",
      classList: {
        add(...names) { names.forEach(n=>cls.add(n)); },
        remove(...names) { names.forEach(n=>cls.delete(n)); },
        contains(name) { return cls.has(name); },
        toggle(name, forced) {
          if (forced===undefined) forced=!cls.has(name);
          if(forced) cls.add(name); else cls.delete(name);
          return forced;
        }
      },
      addEventListener(){}, querySelectorAll(){return[]}, options:[],
      click(){}, style:{}
    });
  }
  return dom.get(id);
}
const ctx=vm.createContext({
  document: {
    getElementById: element,
    querySelectorAll: ()=>[],
    createElement: ()=>element("created"),
  },
  window: {addEventListener(){}},
  console,
  Date, Intl, Math, Number, String, JSON, Array, Set, Map,
  confirm: ()=>true,
  setTimeout(){},
  NativeStore: {
    hasPin:()=>"false",
    getAppVersion:()=>"0.7.0",
    showMessage(){},
    saveData:()=>"ok",
    loadData:()=>"{}",
  }
});
vm.runInContext(match[1], ctx, {timeout:10000});
const expr = code => vm.runInContext(code,ctx,{timeout:10000});

assert.equal(expr("parseTurkishMoney('1.234,56')"),1234.56);
assert.equal(expr("parseTurkishMoney('-1.234,56')"),-1234.56);
assert.equal(expr("parseBankDate('21.11.2026')"),"2026-11-21");
assert.equal(expr("parseBankDate('2026-11-21T12:00:00')"),"2026-11-21");
assert.equal(expr("parseBankDate('not a date')"),"");
assert.equal(expr("bankPlain('İşlem Açıklaması')"),"islem aciklamasi");

expr("db=normalizeDB({})");
expr("db.transactions.push({id:1001,companyId:db.activeCompanyId,date:'2026-11-21',type:'expense',amount:250.50,accountId:db.accounts[1].id,description:'Banka masrafı'})");
expr("db.bankRows.push({id:2001,companyId:db.activeCompanyId,date:'2026-11-21',amount:-250.50,accountId:db.accounts[1].id,description:'Banka masrafı',status:'unmatched'})");
assert.equal(expr("bankSuggestedTransaction(scoped('bankRows')[0], new Set()).id"),1001);
assert.equal(expr("scoped('bankRows').length"),1);

const valid = expr("addVoucher({voucherNo:'TEST-1',date:'2026-11-21',entries:[{debit:100,credit:0},{debit:0,credit:100}]})");
const invalid = expr("addVoucher({voucherNo:'TEST-2',date:'2026-11-21',entries:[{debit:100,credit:0},{debit:0,credit:99}]})");
assert.equal(valid,true);
assert.equal(invalid,false);

expr("db.invoices.push({id:3001,companyId:db.activeCompanyId,party:'Örnek Ltd',number:'ABC123',date:'2026-11-21',net:100,vat:20,total:120,paidAmount:0,taxNo:'1234567890'})");
expr("db.invoices.push({id:3002,companyId:db.activeCompanyId,party:'Örnek Ltd',number:'ABC123',date:'2026-11-21',net:100,vat:20,total:120,paidAmount:0,taxNo:'1234567890'})");
assert.ok(expr("getAuditFindings().some(f=>f.title==='Tekrarlanan fatura')"),"duplicate invoice check failed");

const scopedCount=expr("(()=>{const id=db.activeCompanyId;db.bankRows.push({id:2002,companyId:id+123,date:'2026-11-21',amount:99,status:'unmatched'});return scoped('bankRows').length})()");
assert.equal(scopedCount,1);

assert.ok(page.includes("NativeStore.openInvoiceCamera"), "native camera button is not wired");
assert.ok(page.includes("window.onEmbeddedCameraStatus"), "camera return callback is missing");
assert.ok(page.includes("Uygulama İçi Kamerayla Fotoğraf Çek"), "invoice camera UI is missing");
assert.ok(page.includes("if(readOnlyRecovery)"), "recovery read-only safeguard missing");
assert.ok(page.includes("saveRestoredData"), "encrypted backup restore write missing");
assert.ok(page.includes("saveCsvExport"), "native CSV writer missing");

assert.ok(page.includes('document_parser.js'), 'document parser script is missing');
assert.ok(page.includes('id="documents"'), 'document archive is missing');
assert.ok(page.includes('saveScannedDocument'), 'OCR review save button is missing');
assert.ok(page.includes('renderOcrItems'), 'OCR item editing UI is missing');
assert.ok(page.includes('linkDeliveryToInvoice'), 'delivery-note link is missing');
assert.ok(page.includes('postReceiptExpense'), 'receipt posting confirmation is missing');
assert.ok(page.includes('linkedTransactionId'), 'receipt posting dedup is missing');
assert.ok(page.includes('renderDocuments();'), 'document list is not part of render');
assert.ok(page.includes('function showInvoiceItems'), 'invoice item details are missing');
assert.equal(expr("Array.isArray(normalizeDB({}).documents)"),true);
expr("db.documents.push({id:555001,companyId:db.activeCompanyId,documentType:'delivery_note',items:[],total:144035})");
assert.equal(expr("scoped('documents').length"),1);
assert.ok(!page.includes('NativeStore.uploadReceipt') && !page.includes('remoteOcr'));
console.log('PASS: finance rules, embedded camera, local documents, delivery notes, receipts and recovery');
