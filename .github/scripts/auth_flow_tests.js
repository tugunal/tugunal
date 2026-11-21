/* Functional local-auth tests: no external server, no real credentials. */
"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("app/src/main/assets/index.html","utf8");
const source=fs.readFileSync("app/src/main/assets/js/auth_flow.js","utf8");
new Function(source);
assert.ok(html.includes('id="loginIdentifier"'));
assert.ok(html.includes('id="regUsername"'));
assert.ok(html.includes('id="regExistingPin"'));
const dom=new Map();
function field(id){
 if(!dom.has(id)){
  const names=new Set();
  dom.set(id,{value:"",textContent:"",required:false,disabled:false,
    classList:{add(x){names.add(x)},remove(x){names.delete(x)},contains(x){return names.has(x)},
       toggle(x,force){if(force===undefined)force=!names.has(x);force?names.add(x):names.delete(x);return force;}},
    focus(){},placeholder:""});
 }
 return dom.get(id);
}
const store={
 pin:null,authorized:false,active:"",pending:"",registry:[],data:{settings:{userProfiles:[]}},saves:0,messages:[],failNextSave:false,
 hasPin(){return this.pin?"true":"false"},
 setPin(s){if(this.pin)return "already_set";this.pin=s;this.authorized=true;return"ok"},
 verifyPin(s){this.authorized=!!this.pin&&this.pin===s;return this.authorized?"true":"false"},
 hasLocalAccounts(){return this.registry.length?"true":"false"},
 registerLocalAccount(username,email,phone,password){
  if(!this.authorized)return"locked";
  const key=x=>String(x).trim().toLowerCase();
  const normalize=p=>String(p).replace(/\D/g,"").replace(/^90(?=\d{10}$)/,"").replace(/^0(?=\d{10}$)/,"");
  if(this.registry.some(p=>[p.username,p.email].includes(key(username))||
    [p.username,p.email].includes(key(email))||
    (normalize(phone)&&normalize(p.phone)===normalize(phone))))return"duplicate";
  this.registry.push({username:key(username),email:key(email),phone:normalize(phone),password});
  this.active=key(username);this.pending=this.active;return"ok";
 },
 authenticateLocalAccount(identifier,password){
  this.authorized=false;this.active="";
  const input=String(identifier).toLowerCase(),digits=input.replace(/\D/g,"").replace(/^90(?=\d{10}$)/,"").replace(/^0(?=\d{10}$)/,"");
  const found=this.registry.find(p=>[p.username,p.email].includes(input)||(digits&&digits===p.phone));
  if(!found||found.password!==password)return"invalid";
  this.authorized=true;this.active=found.username;return"ok";
 },
 currentLocalUser(){return this.active},
 loadData(){return this.authorized?JSON.stringify(this.data):"__AUTH_REQUIRED__"},
 saveData(src){if(!this.authorized)return"error_locked";if(this.failNextSave){this.failNextSave=false;return"error"}this.data=JSON.parse(src);this.saves++;this.pending="";return"ok"},
 lockNative(){this.authorized=false;this.active=""},
 rollbackLocalRegistration(username){
  if(!this.authorized||this.active!==username||this.pending!==username)return"locked";
  this.registry=this.registry.filter(x=>x.username!==username);
  this.pending="";this.authorized=false;this.active="";return"ok";
 },
 updateLocalAccountContact(username,email,phone){
  const a=this.registry.find(x=>x.username===username);if(!a)return"not_found";
  a.email=email;a.phone=phone.replace(/\D/g,"");return"ok";
 },
 changeLocalAccountPassword(oldValue,newValue){
  const a=this.registry.find(x=>x.username===this.active);if(!a||a.password!==oldValue)return"invalid_old";
  a.password=newValue;return"ok";
 },
 getAppVersion(){return"1.2.6"},showMessage(s){this.messages.push(s)}
};
let seq=1000;
const ctx=vm.createContext({
 $:field,NativeStore:store,
 document:{activeElement:null,querySelector(){return {textContent:""}}},
 db:{settings:{}},unlocked:false,readOnlyRecovery:false,
 newRecordId(){return ++seq},
 normalizeDB(data){return {...data,settings:data.settings||{}}},
 migrateLegacyData(){},render(){},showView(){},checkForUpdates(){},
 persist(){return store.saveData(JSON.stringify(ctx.db))==="ok";},
 setTimeout(){},prompt(s,defaultName){
   if(s.includes("yeni hesap şifresini belirleyin")||s.includes("Yeni hesap şifresini tekrar"))return "NewStrongPass22";
   return defaultName||"olduser_2";
  },
 roleLabel:r=>r,console,
 showAuthChoice(){},submitRegistration(){},submitPin(){},renderUserProfile(){},
 saveUserProfile(){},changeSecurityPin(){},lockApp(){store.lockNative();ctx.unlocked=false;}
});
vm.runInContext(source,ctx,{filename:"auth_flow.js"});
const call=x=>vm.runInContext(x,ctx);
const put=(id,value)=>field(id).value=value;
put("regFirstName","Recep");put("regLastName","Test");
put("regUsername","recep_test");put("regEmail","recep@hotmail.com");
put("regPhone","0543 111 22 33");put("regRole","business_owner");
put("regOffice","Test Isletme");put("regPin","StrongPass22");
put("regPinConfirm","StrongPass22");field("regLocalConsent").checked=true;
call("submitRegistration({preventDefault(){}})");
assert.equal(store.registry.length,1,"First user must be registered");
assert.equal(store.registry[0].username,"recep_test");
assert.equal(store.data.settings.userProfile.username,"recep_test");
assert.ok(store.saves>=1,"First registration must persist encrypted records");
assert.equal(field("registerError").textContent,"");
call("lockApp()");
put("loginIdentifier","recep_test");put("pinInput","WrongPassword");
call("submitPin()");
assert.equal(ctx.unlocked,false,"Wrong password must not unlock records");
assert.equal(store.authorized,false);
for(const input of ["recep_test","RECEP@HOTMAIL.COM","+90 543 111 22 33"]){
 call("lockApp()");
 put("loginIdentifier",input);put("pinInput","StrongPass22");call("submitPin()");
 assert.equal(ctx.unlocked,true,"Login failed for "+input);
 assert.equal(store.active,"recep_test","Wrong native user resolved");
 assert.equal(store.data.settings.userProfile.username,"recep_test");
}
call("lockApp()");
put("regFirstName","Duplicate");put("regLastName","User");
put("regUsername","recep_test");put("regEmail","second@hotmail.com");
put("regPhone","0555 111 22 33");put("regPin","OtherPassword1");
put("regPinConfirm","OtherPassword1");put("regExistingPin","StrongPass22");
call("submitRegistration({preventDefault(){}})");
assert.equal(store.registry.length,1,"Duplicate username was accepted");
assert.ok(field("registerError").textContent.includes("kayıtlı"),"Duplicate warning missing");
// If encrypted profile persistence fails, the just-created local credential is removed.
call("lockApp()");
put("regUsername","temporary_user");
put("regEmail","temporary@hotmail.com");
put("regPhone","0555 777 33 22");
put("regExistingPin","StrongPass22");
store.failNextSave=true;
call("submitRegistration({preventDefault(){}})");
assert.equal(store.registry.length,1,"Failed account registration left an orphaned credential");
assert.equal(ctx.unlocked,false,"Failed registration unlocked accounting data");
assert.equal(store.data.settings.userProfile.username,"recep_test","Failed registration overwrote accounting profile");
put("regUsername","recep_test");
put("regEmail","second@hotmail.com");
call("lockApp()");
put("loginIdentifier","recep_test");put("pinInput","StrongPass22");call("submitPin()");
put("profileEmail","updated@hotmail.com");
put("profilePhone","0543 111 22 33");put("profileFirstName","Recep");
put("profileLastName","Test");put("profileRole","business_owner");put("profileOffice","Ofis");
store.failNextSave=true;
call("saveUserProfile()");
assert.equal(store.registry[0].email,"recep@hotmail.com","Failed encrypted profile save must roll back login identity");
assert.equal(store.data.settings.userProfile.email,"recep@hotmail.com","Failed encrypted profile save must keep old profile");
assert.ok(!store.messages.at(-1).includes("bilgileri güncellendi"),"Failed profile save should not claim success");
call("saveUserProfile()");
assert.equal(store.registry[0].email,"updated@hotmail.com","Auth identity registry not synchronized");
call("lockApp()");
put("loginIdentifier","updated@hotmail.com");put("pinInput","StrongPass22");call("submitPin()");
assert.equal(ctx.unlocked,true);
// A legacy 6-character device PIN may authorize migration, but must not become
// the password of the new local account.
call("lockApp()");
store.pin="OldP1n";store.authorized=false;store.registry=[];store.active="";
store.data={settings:{
  userProfiles:[],
  userProfile:{id:777,username:"",firstName:"Eski",lastName:"Kullanıcı",
    displayName:"Eski Kullanıcı",email:"legacy@hotmail.com",phone:"0543 222 33 44",role:"accountant"}
}};
call("migrateOldLocalAccount('legacy@hotmail.com','OldP1n')");
assert.equal(store.registry.length,1,"Legacy migration failed to create local account");
assert.equal(store.registry[0].username,"legacy");
assert.equal(store.registry[0].password,"NewStrongPass22","Legacy PIN must not become a new password");
assert.notEqual(store.registry[0].password,"OldP1n");
call("lockApp()");
put("loginIdentifier","legacy@hotmail.com");
put("pinInput","NewStrongPass22");
call("submitPin()");
assert.equal(ctx.unlocked,true,"Migrated user cannot log in with new password");
// A corrupted encrypted database must remain in place and offer recovery,
// never be replaced automatically with a new empty accounting database.
const originalLoad=store.loadData.bind(store);
call("lockApp()");
store.loadData=()=>"__DECRYPT_FAILED__";
put("loginIdentifier","legacy@hotmail.com");
put("pinInput","NewStrongPass22");
call("submitPin()");
assert.equal(ctx.readOnlyRecovery,true,"Encrypted-record corruption must open read-only recovery");
assert.equal(ctx.unlocked,true,"Authenticated user must be able to access recovery settings");
assert.equal(field("recoveryWarning").classList.contains("hidden"),false);
assert.equal(store.data.settings.userProfile.username,"legacy","Encrypted accounting data was overwritten");
store.loadData=originalLoad;
console.log("PASS: failed registrations, profile rollback, short legacy PIN migration, encrypted-data recovery");
console.log("PASS: first registration, unique username, email/Hotmail, phone, wrong password, contact sync and profile persistence");
