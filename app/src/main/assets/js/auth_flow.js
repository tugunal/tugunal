/* Akilli Muhasebe 1.2.6 — secure on-device identity login.
 * Username / Hotmail or any email / phone + an individual password.
 * Native Keystore-encrypted registry retains salted password hashes.
 * This is LOCAL authentication; no remote Hotmail or Firebase verification.
 */
"use strict";
const normalizeAuthText=v=>String(v||"").trim().toLowerCase();
function normalizeAuthPhone(v){
 let d=String(v||"").replace(/\D/g,"");
 if(d.length===14&&d.startsWith("0090"))d=d.slice(4);
 if(d.length===12&&d.startsWith("90"))d=d.slice(2);
 if(d.length===11&&d.startsWith("0"))d=d.slice(1);
 return d;
}
const validAuthUsername=u=>/^[a-z0-9._-]{3,30}$/.test(normalizeAuthText(u));
const validAuthEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthText(e))&&String(e).length<=120;
const validAuthPhone=p=>!p||/^[0-9]{10,15}$/.test(normalizeAuthPhone(p));
function appAuthProfiles(data){
 const settings=data?.settings||{};
 const profiles=Array.isArray(settings.userProfiles)?settings.userProfiles.slice():[];
 if(settings.userProfile&&!profiles.some(p=>String(p.id)===String(settings.userProfile.id)||
     (p.email&&normalizeAuthText(p.email)===normalizeAuthText(settings.userProfile.email))))
   profiles.push(settings.userProfile);
 return profiles;
}
function sameProfileIdentity(profile,input){
 const v=normalizeAuthText(input),phone=normalizeAuthPhone(input);
 return (!!v&&v===normalizeAuthText(profile.username))||
        (!!v&&v===normalizeAuthText(profile.email))||
        (!!phone&&phone===normalizeAuthPhone(profile.phone));
}
function duplicateAppAccount(profiles,username,email,phone,excludeId){
 const u=normalizeAuthText(username),e=normalizeAuthText(email),p=normalizeAuthPhone(phone);
 return profiles.some(x=>String(x.id)!==String(excludeId||"")&&
   [normalizeAuthText(x.username),normalizeAuthText(x.email)].some(key=>key&&[u,e].includes(key)) ||
   (p&&String(x.id)!==String(excludeId||"")&&p===normalizeAuthPhone(x.phone)));
}
function authRegistryState(){
 try{return NativeStore.hasLocalAccounts()}catch(e){return "error";}
}
function authFriendlyError(code){
 return ({
  invalid:"Kullanıcı adı, e-posta, telefon veya şifre geçersiz.",
  duplicate:"Kullanıcı adı, e-posta ya da telefon zaten kayıtlı.",
  locked:"Cihaz güvenlik doğrulaması gerekli.",
  rate_limited:"Çok sayıda hatalı deneme. 30 saniye sonra tekrar deneyin.",
  no_accounts:"Önce Yeni Kayıt Oluştur bölümünden hesap açın.",
  not_found:"Hesap bulunamadı.",
  error:"Güvenli hesap işleminde sorun oluştu. Veriler korunuyor."
 })[code]||"İşlem tamamlanamadı.";
}
showAuthChoice=function(choice){
 for(const [panel,name] of [["welcomePanel","welcome"],["pinLoginPanel","login"],["registrationPanel","register"]])
   $(panel).classList.toggle("hidden",choice!==name);
 $("pinError").textContent="";$("registerError").textContent="";
 const hasPin=NativeStore.hasPin()==="true",state=authRegistryState();
 if(choice==="login"){
   $("lockText").textContent=state==="true"
     ?"Kullanıcı adı, Hotmail dâhil e-posta adresiniz veya telefon numaranız ve şifrenizle giriş yapın."
     :hasPin
      ?"Eski hesabınızı e-posta veya telefon ve eski PIN ile taşıyabilir, ya da yeni kayıt oluşturabilirsiniz."
      :"Bu cihazda kayıt yok. Önce Yeni Kayıt Oluştur seçeneğini kullanın.";
   $("pinButton").disabled=!hasPin&&state!=="true";
   $("legacyLoginButton").classList.toggle("hidden",!hasPin);
   if(hasPin||state==="true")setTimeout(()=>$("loginIdentifier").focus(),120);
 }
 if(choice==="register"){
   $("existingPinField").classList.toggle("hidden",!hasPin);
   $("regExistingPin").required=hasPin;
   $("regPin").placeholder="Yeni hesap şifresi (en az 8 karakter)";
   $("regPinConfirm").placeholder="Yeni şifre tekrar";
 }
};
function safeReadAccountDB(){
 const raw=NativeStore.loadData();
 if(raw==="__AUTH_REQUIRED__")throw Error("Şifre doğrulaması başarısız.");
 if(raw==="__DECRYPT_FAILED__")throw Error("Şifreli kayıt okunamadı. Mevcut veriler korunuyor. Önce yedeğinizi kontrol edin.");
 let parsed;
 try{parsed=JSON.parse(raw||"{}");}
 catch(_){throw Error("Kayıt biçimi bozuk. Mevcut kayıtlar korunuyor; şifreli yedeğinizi geri yükleyin.");}
 return normalizeDB(parsed);
}
function showEncryptedRecordRecovery(message){
  db=normalizeDB({});
  readOnlyRecovery=true;unlocked=true;
  $("lock").classList.add("hidden");
  $("pinInput").value="";
  render();showView("settings");
  $("recoveryWarning").classList.remove("hidden");
  NativeStore.showMessage(message+" Mevcut kayıtlar silinmedi; şifreli yedeğinizi geri yükleyin.");
}
function finishAuthenticatedSession(data,profile){
 if(!profile)throw Error("Bu hesaba ait kullanıcı profili bulunamadı. Kayıtlar korunuyor.");
 data.settings=data.settings||{};
 if(!Array.isArray(data.settings.userProfiles))data.settings.userProfiles=appAuthProfiles(data);
 data.settings.userProfile=profile;
 db=data;readOnlyRecovery=false;unlocked=false;
 migrateLegacyData();
 const result=NativeStore.saveData(JSON.stringify(db));
 if(result!=="ok")throw Error("Şifreli verilerin kaydı doğrulanamadı. Yedek alın.");
 if(typeof rememberDurableDB==="function")rememberDurableDB();
 unlocked=true;
 $("lock").classList.add("hidden");
 $("pinInput").value="";$("regPin").value="";$("regPinConfirm").value="";
 $("regExistingPin").value="";
 render();showView("dashboard");
 $("appVersionText").textContent=NativeStore.getAppVersion();
 setTimeout(()=>checkForUpdates(false),900);
}
submitRegistration=function(event){
 event?.preventDefault();
 const first=$("regFirstName").value.trim(),last=$("regLastName").value.trim(),
 u=normalizeAuthText($("regUsername").value),email=normalizeAuthText($("regEmail").value),
 phone=$("regPhone").value.trim(),role=$("regRole").value,office=$("regOffice").value.trim(),
 password=$("regPin").value,confirmation=$("regPinConfirm").value;
 const error=$("registerError");error.textContent="";
 if(first.length<2||last.length<2){error.textContent="Ad ve soyad en az 2 karakter olmalı.";return false;}
 if(!validAuthUsername(u)){error.textContent="Kullanıcı adı 3–30 karakter olmalı: harf, rakam, nokta, alt çizgi veya tire.";return false;}
 if(!validAuthEmail(email)){error.textContent="Geçerli e-posta adresi girin (Hotmail dâhil).";return false;}
 if(!validAuthPhone(phone)){error.textContent="Telefon numarasını kontrol edin.";return false;}
 if(!["accountant","business_owner","finance","employee","other"].includes(role)){error.textContent="Kullanıcı türü seçin.";return false;}
 if(password.length<8||password.length>64){error.textContent="Şifre 8–64 karakter olmalı.";return false;}
 if(password!==confirmation){error.textContent="Şifre tekrarı eşleşmiyor.";return false;}
 if(!$("regLocalConsent").checked){error.textContent="Yerel kayıt bilgilendirmesini onaylayın.";return false;}
 $("registerSubmit").disabled=true;
 const alreadyPin=NativeStore.hasPin()==="true";
 let accountRegistered=false;
 try{
   if(alreadyPin){
     const oldPin=$("regExistingPin").value;
     if(NativeStore.verifyPin(oldPin)!=="true")throw Error("Mevcut cihaz PIN'i yanlış. Eski PIN'i girmelisiniz.");
   }else if(NativeStore.setPin(password)!=="ok")throw Error("Cihaz güvenlik şifresi oluşturulamadı.");
   const data=safeReadAccountDB();
   const profiles=appAuthProfiles(data);
   if(duplicateAppAccount(profiles,u,email,phone,null))throw Error("Bu kullanıcı adı, e-posta veya telefon başka bir profilde kayıtlı.");
   const registered=NativeStore.registerLocalAccount(u,email,phone,password);
   if(registered!=="ok")throw Error(authFriendlyError(registered));
   accountRegistered=true;
   const profile={id:newRecordId(),username:u,firstName:first,lastName:last,displayName:first+" "+last,
     email,phone,role,officeName:office,createdAt:new Date().toISOString(),
     updatedAt:new Date().toISOString(),registrationType:"local-device"};
   data.settings=data.settings||{};
   data.settings.userProfiles=profiles.concat([profile]);
   data.settings.userProfile=profile;
   if(office&&!data.settings.businessName)data.settings.businessName=office;
   finishAuthenticatedSession(data,profile);
   NativeStore.showMessage("Kullanıcı kaydı oluşturuldu. Hoş geldiniz, "+first+".");
 }catch(err){
   const rollback=accountRegistered?NativeStore.rollbackLocalRegistration(u):"not_required";
   unlocked=false;
   NativeStore.lockNative();
   error.textContent=String(err.message||err)+
     (accountRegistered&&rollback!=="ok"&&rollback!=="locked"?" Hesap kaydı geri alınamadı; mevcut verileri silmeyin.":"");
   if(NativeStore.hasPin()==="true")$("existingPinField").classList.remove("hidden");
 }finally{$("registerSubmit").disabled=false;}
 return false;
};
function migrateOldLocalAccount(identifier,password){
 // Migration is explicitly authorized by the ORIGINAL device PIN.
 if(NativeStore.verifyPin(password)!=="true")throw Error("Eski cihaz PIN'i yanlış.");
 const data=safeReadAccountDB();
 const profiles=appAuthProfiles(data);
 const profile=profiles.find(p=>sameProfileIdentity(p,identifier));
 if(!profile)throw Error("Eski kullanıcı bulunamadı. E-posta veya telefonunuzu kontrol edin. Profil yoksa Yeni Kayıt Oluştur bölümünü kullanın.");
 let username=normalizeAuthText(profile.username);
 if(!validAuthUsername(username)){
   const suggestion=validAuthUsername(profile.email?.split("@")[0])?normalizeAuthText(profile.email.split("@")[0]):"";
   const chosen=prompt("Eski hesabınız için bir kullanıcı adı belirleyin (3–30 karakter):",suggestion);
   if(chosen===null)throw Error("Kullanıcı adı oluşturulmadı; mevcut kayıtlar değişmedi.");
   username=normalizeAuthText(chosen);
 }
 if(!validAuthUsername(username))throw Error("Kullanıcı adı 3–30 karakter olmalı: harf, rakam, nokta, alt çizgi veya tire.");
 if(!validAuthEmail(profile.email))throw Error("Eski profilde geçerli e-posta yok. Önce eski uygulamadan profil bilgilerini düzenleyin.");
 if(duplicateAppAccount(profiles,username,profile.email,profile.phone,profile.id))
   throw Error("Kullanıcı adı, e-posta veya telefon başka bir profilde kullanılıyor.");
 // The legacy device PIN authorizes migration but must not become the account password.
 const newPassword=prompt("Eski PIN ile giriş yerine kullanacağınız yeni hesap şifresini belirleyin (8–64 karakter):");
 if(newPassword===null)throw Error("Yeni şifre belirlenmedi; eski kayıtlar korunuyor.");
 if(newPassword.length<8||newPassword.length>64)throw Error("Yeni hesap şifresi 8–64 karakter olmalı.");
 const confirmPassword=prompt("Yeni hesap şifresini tekrar girin:");
 if(confirmPassword!==newPassword)throw Error("Yeni şifreler eşleşmiyor; eski kayıtlar korunuyor.");
 const registered=NativeStore.registerLocalAccount(username,profile.email,profile.phone,newPassword);
 if(registered!=="ok")throw Error(authFriendlyError(registered));
 profile.username=username;
 data.settings.userProfiles=profiles;
 try{finishAuthenticatedSession(data,profile);}
 catch(err){
   const rollback=NativeStore.rollbackLocalRegistration(username);
   NativeStore.lockNative();
   throw Error(String(err.message||err)+
     (rollback==="ok"?" Yeni hesap kaydı geri alındı; eski PIN'iniz geçerlidir.":" Hesap geçişi doğrulanamadı; eski kayıtlarınızı silmeyin."));
 }
 NativeStore.showMessage("Eski hesabınız güvenli girişe aktarıldı.");
}
function loginLegacyAccount(){
 const identifier=$("loginIdentifier").value.trim(),password=$("pinInput").value;
 if(!identifier||!password){$("pinError").textContent="E-posta veya telefon ile eski PIN'i girin.";return;}
 try{migrateOldLocalAccount(identifier,password);}
 catch(e){$("pinError").textContent=String(e.message||e);NativeStore.lockNative();}
}
submitPin=function(){
 const identifier=$("loginIdentifier").value.trim(),password=$("pinInput").value;
 const error=$("pinError");error.textContent="";
 if(!identifier){error.textContent="Kullanıcı adı, e-posta veya telefon numarası girin.";return;}
 if(!password){error.textContent="Şifre girin.";return;}
 const state=authRegistryState();
 if(state==="error"){error.textContent="Hesap kayıtları okunamadı. Veriler korunuyor.";return;}
 if(state!=="true"){
   if(NativeStore.hasPin()!=="true"){error.textContent="Önce yeni kullanıcı kaydı oluşturun.";return;}
   loginLegacyAccount();return;
 }
 const status=NativeStore.authenticateLocalAccount(identifier,password);
 if(status!=="ok"){error.textContent=authFriendlyError(status);return;}
 try{
   const data=safeReadAccountDB();
   const active=normalizeAuthText(NativeStore.currentLocalUser());
   const profile=appAuthProfiles(data).find(p=>normalizeAuthText(p.username)===active);
   finishAuthenticatedSession(data,profile);
 }catch(e){
   const message=String(e.message||e);
   if(message.includes("Şifreli kayıt okunamadı")||message.includes("Kayıt biçimi bozuk")){
     showEncryptedRecordRecovery(message);
   }else{
     NativeStore.lockNative();
     error.textContent=message;
   }
 }
};
renderUserProfile=function(){
 const p=db?.settings?.userProfile;if(!p)return;
 const values={profileUsername:p.username,profileFirstName:p.firstName,profileLastName:p.lastName,
   profileEmail:p.email,profilePhone:p.phone,profileRole:p.role,profileOffice:p.officeName};
 for(const [id,value]of Object.entries(values)){
   const el=$(id);
   if(el&&document.activeElement!==el)el.value=value||"";
 }
 if($("profileStatus"))$("profileStatus").textContent=
   "Kullanıcı: "+(p.displayName||"")+" • "+(p.username||"Eski profil")+
   " • "+roleLabel(p.role)+" • Yerel kayıt";
};
saveUserProfile=function(){
 if(!unlocked||readOnlyRecovery)return NativeStore.showMessage("Kullanıcı profili değiştirilemiyor.");
 const previous=db?.settings?.userProfile;
 if(!previous)return NativeStore.showMessage("Aktif kullanıcı profili bulunamadı.");
 const first=$("profileFirstName").value.trim(),last=$("profileLastName").value.trim(),
   email=normalizeAuthText($("profileEmail").value),phone=$("profilePhone").value.trim(),
   role=$("profileRole").value,office=$("profileOffice").value.trim();
 if(first.length<2||last.length<2)return NativeStore.showMessage("Ad ve soyad en az 2 karakter olmalı.");
 if(!validAuthEmail(email)||!validAuthPhone(phone))return NativeStore.showMessage("E-posta veya telefon numarası geçersiz.");
 const profiles=appAuthProfiles(db);
 if(duplicateAppAccount(profiles,previous.username||"",email,phone,previous.id))
   return NativeStore.showMessage("E-posta veya telefon başka bir kullanıcıya ait.");
 const active=normalizeAuthText(NativeStore.currentLocalUser());
 const accountMatches=!!active&&active===normalizeAuthText(previous.username);
 if(accountMatches){
   const res=NativeStore.updateLocalAccountContact(active,email,phone);
   if(res!=="ok")return NativeStore.showMessage(authFriendlyError(res));
 }
 const previousProfiles=db.settings.userProfiles;
 const profile={...previous,firstName:first,lastName:last,displayName:first+" "+last,
   email,phone,role,officeName:office,updatedAt:new Date().toISOString()};
 db.settings.userProfiles=profiles.map(p=>String(p.id)===String(previous.id)?profile:p);
 db.settings.userProfile=profile;
 if(persist()!==true){
   db.settings.userProfiles=previousProfiles;
   db.settings.userProfile=previous;
   if(accountMatches){
     const rollback=NativeStore.updateLocalAccountContact(active,previous.email||"",previous.phone||"");
     if(rollback!=="ok")return NativeStore.showMessage("Profil kaydı doğrulanamadı; giriş iletişim bilgileri geri alınamadı. Mevcut oturumu kapatmadan yedek alın.");
   }
   return NativeStore.showMessage("Profil kaydedilemedi. Önceki bilgiler geri yüklendi.");
 }
 NativeStore.showMessage("Kullanıcı bilgileri güncellendi.");
};
changeSecurityPin=function(){
 if(!unlocked||readOnlyRecovery)return NativeStore.showMessage("Önce kullanıcı hesabınızla giriş yapın.");
 if(!NativeStore.currentLocalUser())return NativeStore.showMessage("Önce eski hesabınızı yeni giriş sistemine bağlayın.");
 const old=prompt("Mevcut hesap şifrenizi girin:");if(!old)return;
 const value=prompt("Yeni hesap şifresi (8–64 karakter):");if(value===null)return;
 if(value.length<8||value.length>64)return NativeStore.showMessage("Şifre 8–64 karakter olmalı.");
 const again=prompt("Yeni hesap şifresini tekrar girin:");if(again!==value)
   return NativeStore.showMessage("Şifreler eşleşmiyor.");
 const result=NativeStore.changeLocalAccountPassword(old,value);
 NativeStore.showMessage(result==="ok"?"Hesap şifreniz değiştirildi.":result==="invalid_old"?
   "Mevcut hesap şifresi yanlış.":authFriendlyError(result));
};
const oldLockApp=lockApp;
lockApp=function(){
 oldLockApp();
 $("loginIdentifier").value="";$("pinInput").value="";
 showAuthChoice("welcome");
};
