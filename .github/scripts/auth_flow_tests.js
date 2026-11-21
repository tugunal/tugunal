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
 pin:null,authorized:false,active:"",registry:[],data:{settings:{userProfiles:[]}},saves:0,messages:[],
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
  this.active=key(username);return"ok";
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
 saveData(src){if(!this.authorized)return"error_locked";this.data=JSON.parse(src);this.saves++;return"ok"},
 lockNative(){this.authorized=false;this.active=""},
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
 setTimeout(){},prompt(_s,defaultName){return defaultName||"olduser_2"},
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
call("lockApp()");
put("loginIdentifier","recep_test");put("pinInput","StrongPass22");call("submitPin()");
put("profileEmail","updated@hotmail.com");
put("profilePhone","0543 111 22 33");put("profileFirstName","Recep");
put("profileLastName","Test");put("profileRole","business_owner");put("profileOffice","Ofis");
call("saveUserProfile()");
assert.equal(store.registry[0].email,"updated@hotmail.com","Auth identity registry not synchronized");
call("lockApp()");
put("loginIdentifier","updated@hotmail.com");put("pinInput","StrongPass22");call("submitPin()");
assert.equal(ctx.unlocked,true);
console.log("PASS: first registration, unique username, email/Hotmail, phone, wrong password, contact sync and profile persistence");
