/* Akilli Muhasebe 1.0 – offline smoke and integration tests (no Android emulator). */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root="app/src/main/assets/";
const html=fs.readFileSync(root+"index.html","utf8");
const sources=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(sources,[
  "document_parser.js","ubl_parser.js","js/accounting_rules.js","js/app_model.js","js/app_main.js",
  "js/app_records.js","js/app_reports.js","js/app_bank.js","js/app_documents.js",
  "js/app_stock.js","js/workspace.js","js/auth_flow.js","js/app_init.js"
],"scripts must load in dependency order");
for(const path of sources)assert.ok(fs.existsSync(root+path),"missing "+path);
for(const path of sources)new Function(fs.readFileSync(root+path,"utf8"));

const dom=new Map();
function element(id){
  if(!dom.has(id)){
    const classes=new Set();
    dom.set(id,{
      id,value:"",type:"text",textContent:"",innerHTML:"",dataset:{},style:{},
      classList:{
        add(...names){for(const x of names)classes.add(x)},
        remove(...names){for(const x of names)classes.delete(x)},
        contains(x){return classes.has(x)},
        toggle(x,force){if(force===undefined)force=!classes.has(x);force?classes.add(x):classes.delete(x);return force;}
      },
      addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},
      reset(){},click(){},options:[],focus(){},
    });
  }
  return dom.get(id);
}
const fakeWindow={addEventListener(){},scrollTo(){}};
const native={
  saved:[],messages:[],hasPin:()=>"true",getAppVersion:()=>"1.2.0",
  showMessage(s){this.messages.push(String(s))},saveData(json){this.saved.push(JSON.parse(json));return"ok"},
  loadData(){return"{}"},verifyPin(){return"true"},setPin(){return"ok"},
  checkForUpdate(){},saveCsvExport(){return"ok"},
};
const env={
  addEventListener(){},scrollTo(){},
  window:fakeWindow,document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>element("_created")},
  NativeStore:native,console,Date,Intl,Math,Number,String,Array,JSON,Set,Map,
  confirm:()=>true,prompt:()=>"",setTimeout(){},FileReader:function(){},
};
const ctx=vm.createContext(env);
env.window=env; // window handlers and global scripts share the same global object
for(const path of sources.filter(x=>x!=="js/app_init.js")){
  vm.runInContext(fs.readFileSync(root+path,"utf8"),ctx,{filename:path,timeout:20000});
}
const expr=code=>vm.runInContext(code,ctx,{timeout:20000});
expr("db=normalizeDB({});unlocked=true");
const activeId=expr("db.activeCompanyId");
assert.ok(activeId);
assert.equal(expr("Array.isArray(scoped('products'))"),true);
assert.equal(expr("Array.isArray(scoped('stockMovements'))"),true);
assert.equal(expr("Array.isArray(scoped('activityLog'))"),true);
assert.equal(expr("parseTurkishMoney('1.234,56')"),1234.56);
assert.equal(expr("parseBankDate('21.11.2026')"),"2026-11-21");
assert.equal(expr("bankPlain('İşlem Açıklaması')"),"islem aciklamasi");

const voucher=expr("AccountingRules.balanceVoucher({entries:[{debit:240,credit:0},{debit:0,credit:240}]})");
assert.equal(voucher.balanced,true);
assert.equal(expr("AccountingRules.balanceVoucher({entries:[{debit:240,credit:0},{debit:0,credit:239}]}).balanced"),false);
assert.equal(expr("AccountingRules.balanceVoucher({entries:[{debit:-5,credit:0},{debit:0,credit:5}]}).balanced"),false);
assert.equal(expr("addVoucher({voucherNo:'TEST-1',date:'2026-11-21',entries:[{debit:100,credit:0},{debit:0,credit:100}]})"),true);
assert.equal(expr("addVoucher({voucherNo:'TEST-2',date:'2026-11-21',entries:[{debit:100,credit:0},{debit:0,credit:90}]})"),false);

expr("db.transactions.push({id:7891,companyId:db.activeCompanyId,date:'2026-11-21',type:'expense',amount:250.50,accountId:db.accounts[1].id,description:'Banka masrafı'})");
expr("db.bankRows.push({id:7892,companyId:db.activeCompanyId,date:'2026-11-21',amount:-250.50,accountId:db.accounts[1].id,description:'Banka masrafı',status:'unmatched'})");
assert.equal(expr("bankSuggestedTransaction(scoped('bankRows')[0],new Set()).id"),7891);

expr("db.invoices.push({id:321,companyId:db.activeCompanyId,party:'Örnek Ltd',number:'TEST123',date:'2026-11-21',net:100,vat:20,total:120,paidAmount:0})");
assert.equal(expr("AccountingRules.invoiceDuplicate(db.invoices,{party:'Örnek Ltd',number:'TEST123',date:'2026-11-21'},db.activeCompanyId)"),true);
assert.equal(expr("AccountingRules.invoiceBalance(scoped('invoices')[0]).remaining"),120);

expr("db.documents.push({id:5021,companyId:db.activeCompanyId,documentType:'delivery_note',number:'IRS-33',date:'2026-11-21',party:'Örnek',items:[{code:'FWR5',name:'Mantolama Levhası',quantity:70,unit:'PKT',unitPrice:100,amount:7000},{code:'FIYS',name:'Sıva',quantity:5,unit:'ADET',unitPrice:60,amount:300}]})");
const notePlan=expr("AccountingRules.deliveryPlan(scoped('documents')[0],db.products,db.stockMovements,db.activeCompanyId,'in')");
assert.equal(notePlan.ok,true);
assert.equal(notePlan.lines.length,2);
assert.equal(expr("AccountingRules.deliveryPlan(scoped('documents')[0],db.products,db.stockMovements,db.activeCompanyId,'out').ok"),false);

// For UI mutations, stop redraw. Verify actual data-layer changes.
expr("persist=function(){ /* simulated encrypted persistence in VM */ }");
element("stockDeliverySelect").value="5021";element("stockDeliveryDirection").value="in";
expr("applyDeliveryStock()");
assert.equal(expr("scoped('products').length"),2);
assert.equal(expr("scoped('stockMovements').length"),2);
assert.equal(expr("scoped('documents')[0].stockApplied.direction"),"in");
assert.equal(expr("scoped('products').reduce((s,p)=>s+stockOnHand(p),0)"),75);
assert.equal(expr("AccountingRules.deliveryPlan(scoped('documents')[0],db.products,db.stockMovements,db.activeCompanyId,'in').ok"),false);
assert.equal(expr("scoped('activityLog').length"),1);

const firstProductId=expr("scoped('products')[0].id");
assert.equal(expr("AccountingRules.movementAllowed(stockProductById("+firstProductId+"),db.stockMovements,db.activeCompanyId,-1000).ok"),false);
expr("db.companies.push({id:777777,name:'İkinci Firma'});db.activeCompanyId=777777");
assert.equal(expr("scoped('products').length"),0,"no cross-company inventory leak");
assert.equal(expr("scoped('documents').length"),0,"no cross-company document leak");
expr("db.activeCompanyId="+activeId);

assert.ok(html.includes('id="registrationPanel"'),"first-run registration panel missing");
assert.ok(html.includes('id="regFirstName"'),"registration first name field missing");
assert.ok(html.includes('id="regLastName"'),"registration last name field missing");
assert.ok(html.includes('id="regEmail"'),"registration email field missing");
assert.ok(html.includes('id="regRole"'),"registration role field missing");
assert.ok(html.includes('id="regPinConfirm"'),"registration PIN confirmation missing");
assert.ok(html.includes('submitRegistration(event)'),"registration submit action missing");
assert.ok(html.includes('id="userProfilePanel"'),"user profile settings missing");
const registrationSource=fs.readFileSync(root+"js/app_main.js","utf8");
assert.ok(registrationSource.includes("function submitRegistration(event)"),"registration handler missing");
assert.ok(registrationSource.includes("db.settings.userProfile"),"profile not stored in encrypted app data");
assert.ok(registrationSource.includes("NativeStore.setPin(pin)"),"native PIN registration missing");
assert.ok(registrationSource.includes("function saveUserProfile()"),"profile edit missing");
assert.ok(registrationSource.includes("registrationType:'local-device'"),"registration scope not explicit");
assert.ok(!/FirebaseAuth|createUserWithEmailAndPassword/.test(registrationSource),"must not imply cloud auth without Firebase");
assert.ok(html.includes('çevrimdışı kullanıcı profili oluşturduğunu'),"offline/local registration disclosure missing");
assert.ok(html.includes('Kullanıcı Profili'),"profile settings entry missing");
assert.ok(html.includes('Kullanıcı kaydını oluştur'),"register button missing");
assert.ok(html.includes('id="welcomePanel"'),"first screen choice panel missing");
assert.ok(html.includes("Kullanıcı Girişi Yap"),"login choice missing");
assert.ok(html.includes("Yeni Kayıt Oluştur"),"registration choice missing");
assert.ok(registrationSource.includes("function showAuthChoice(choice)"),"auth choice handler missing");
assert.ok(registrationSource.includes("if(hasPin)"),"existing device PIN authorization missing");
assert.ok(registrationSource.includes("userProfiles.push(profile)"),"additional local profile support missing");
assert.ok(html.includes('id="pinLoginPanel"'),"existing PIN login remains available");
assert.ok(/id="pinInput"[^>]*inputmode="text"/.test(html),"login keyboard must allow letters and numbers");
assert.ok(html.includes('id="loginIdentifier"'),"username, email and phone identifier field missing");
assert.ok(html.includes('Kullanıcı adı, e-posta (Hotmail) veya telefon'),"email or phone login label missing");
assert.ok(html.includes('id="regUsername"'),"new registration username field missing");
assert.ok(html.includes('id="regExistingPin"'),"existing user migration requires existing device PIN");
assert.ok(html.includes('id="profileUsername"'),"profile username must be visible");
assert.ok(!html.includes('Harf ve rakam içeren parolanızı girin'),"old login placeholder must be updated");
assert.ok(html.includes('id="workflow"'),"workflow view missing");
assert.ok(html.includes('id="inventory"'),"inventory view missing");
assert.ok(html.includes('id="globalCompanySelect"'),"global company selector missing");
assert.ok(html.includes('id="documents"'),"document archive missing");
assert.ok(html.includes('id="stockDeliverySelect"'),"delivery note importer missing");
assert.ok(fs.existsSync(root+"css/workspace.css"),"style file missing");
assert.ok(fs.readFileSync(root+"css/workspace.css","utf8").includes("@media(min-width:1050px)"),"desktop sidebar rules missing");
assert.ok(sources.some(x=>x==="js/app_documents.js"),"document module missing");


assert.ok(html.includes('id="ublInvoice"'),"UBL XML chooser missing");
assert.ok(html.includes('handleUblFile(event)'),"UBL read handler missing");
assert.ok(html.includes('changeSecurityPin()'),"PIN change UI missing");
const nativeSource=fs.readFileSync('app/src/main/java/com/tugunal/akillimuhasebe/MainActivity.java','utf8');
assert.ok(nativeSource.includes('nativeUnlocked = MessageDigest.isEqual(expected, actual)'),"native PIN verifier missing");
assert.ok(nativeSource.includes('if (!nativeUnlocked) return "__AUTH_REQUIRED__"'),"native read auth missing");
assert.ok(nativeSource.includes('if (!nativeUnlocked) return "error_locked"'),"native save auth missing");
assert.ok(nativeSource.includes('public String changePin('),"PIN change native missing");
assert.ok(nativeSource.includes('CANONICAL_PACKAGE_ID = "com.tugunal.akillimuhasebe.stable"'),"canonical update ID missing");
assert.ok(nativeSource.includes('verifyUpdateApkIdentity(target)'),"installer must verify package and signing certificate");
assert.ok(nativeSource.includes('name.equals("AkilliMuhasebe-v" + latestVersion + ".apk")'),"only one stable release APK should be installable");
assert.ok(!nativeSource.includes('boolean separateInstall'),"legacy alternate package installation must remain disabled");
const xmlSource=fs.readFileSync(root+'ubl_parser.js','utf8');
assert.ok(xmlSource.includes('UBL-TR') && xmlSource.includes('DOMParser'),"UBL reader not loaded");
assert.ok(!/fetch\s*\(|XMLHttpRequest/.test(xmlSource),"UBL parsing must be offline");
assert.equal(expr("typeof UBLParser.parseInvoice"),"function");
assert.ok(expr("(()=>{try{UBLParser.parseInvoice('<!DOCTYPE z [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><Invoice/>');return false;}catch(e){return true}})()"),"XXE parser guard failed");
const extra=expr("(()=>{const c=newRecordId();db.companies.push({id:c,name:'Test Separate Business'});db=normalizeDB(db);return {id:c,cash:db.accounts.filter(a=>a.companyId===c&&a.kind==='cash').length,bank:db.accounts.filter(a=>a.companyId===c&&a.kind==='bank').length}})()");
assert.equal(extra.cash,1,"separate company's cash account missing");
assert.equal(extra.bank,1,"separate company's bank account missing");
assert.equal(expr("AccountingRules.round(123.456)"),123.46);
assert.equal(expr("typeof exportInvoicesCsv"),"function");
assert.equal(expr("typeof exportDocumentsCsv"),"function");
assert.equal(expr("typeof exportBankCsv"),"function");
assert.equal(expr("typeof exportStockCsv"),"function");
assert.equal(expr("typeof changeSecurityPin"),"function");


assert.ok(nativeSource.includes("public String hasLocalAccounts()"),"local auth registry missing");
assert.ok(nativeSource.includes("public String registerLocalAccount("),"native signup missing");
assert.ok(nativeSource.includes("public String authenticateLocalAccount("),"native identifier+password login missing");
assert.ok(nativeSource.includes("public String updateLocalAccountContact("),"profile contact changes must update login identities");
assert.ok(nativeSource.includes("public String changeLocalAccountPassword("),"per-user password change missing");
assert.ok(nativeSource.includes("derivePinHash(password, salt)"),"passwords must have salted PBKDF2 hashes");
assert.ok(nativeSource.includes("public String rollbackLocalRegistration("),"uncommitted account credentials must be reversible");
assert.ok(nativeSource.includes('pendingLocalRegistrationUsername = "";'),"pending account marker must be cleared after successful save");
assert.ok(nativeSource.includes('.putString("encrypted_db", encrypted).commit()'),"encrypted data save must be synchronous and verified");
assert.ok(nativeSource.includes('pin.length() > 64'),"initial local PIN must accept 64-character account password");
assert.ok(fs.readFileSync(root+"js/auth_flow.js","utf8").includes('const newPassword=prompt('),
  "legacy PIN migration must prompt for a new, stronger account password");
assert.ok(fs.readFileSync(root+"js/auth_flow.js","utf8").includes("showEncryptedRecordRecovery("),
  "corrupt encrypted records must open protected recovery");
assert.ok(fs.readFileSync(root+"js/app_main.js","utf8").includes("render();return true;"),
  "persistence must report actual success to profile editor");
assert.ok(nativeSource.includes("encryptLocalData(accounts.toString())"),"auth registry must be Keystore encrypted");
assert.ok(nativeSource.includes("activeLocalUsername"),"native account binding missing");
assert.ok(!nativeSource.includes('put("password"'),"plain-text password storage forbidden");
assert.equal(expr("validAuthUsername('test_user-3')"),true);
assert.equal(expr("validAuthUsername('ab')"),false);
assert.equal(expr("validAuthEmail('ornek@hotmail.com')"),true);
assert.equal(expr("validAuthEmail('yanlis-at-eposta')"),false);
assert.equal(expr("normalizeAuthPhone('0543 111 22 33')"),"5431112233");
assert.equal(expr("normalizeAuthPhone('+90 (543) 111 22 33')"),"5431112233");
assert.equal(expr("sameProfileIdentity({username:'Kisi_1',email:'Kisi@Hotmail.com',phone:'0543 111 22 33'},'KISI_1')"),true);
assert.equal(expr("sameProfileIdentity({username:'Kisi_1',email:'Kisi@Hotmail.com',phone:'0543 111 22 33'},'kisi@hotmail.com')"),true);
assert.equal(expr("sameProfileIdentity({username:'Kisi_1',email:'Kisi@Hotmail.com',phone:'0543 111 22 33'},'+905431112233')"),true);
assert.equal(expr("duplicateAppAccount([{id:1,username:'kisi',email:'kisi@hotmail.com',phone:'05431112233'}],'yeni','kisi@hotmail.com','',0)"),true);
assert.equal(expr("duplicateAppAccount([{id:1,username:'kisi',email:'kisi@hotmail.com',phone:'05431112233'}],'yeni','yeni@hotmail.com','05554443322',0)"),false);
assert.equal(expr("typeof submitPin"),"function");
assert.equal(expr("typeof submitRegistration"),"function");
assert.equal(expr("typeof loginLegacyAccount"),"function");

console.log("PASS: accounting, bank, XML, username/Hotmail/phone login, password hashing checks, migration and single APK policy");
