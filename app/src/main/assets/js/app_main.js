/* Akilli Muhasebe 1.0 — app_main.js */
function bootstrap(){
 $('today').textContent=new Date().toLocaleDateString('tr-TR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
 $('welcomePanel').classList.remove('hidden');
 $('pinLoginPanel').classList.add('hidden');
 $('registrationPanel').classList.add('hidden');
 $('pinError').textContent='';$('registerError').textContent='';
}
function showAuthChoice(choice){
 $('welcomePanel').classList.toggle('hidden',choice!=='welcome');
 $('pinLoginPanel').classList.toggle('hidden',choice!=='login');
 $('registrationPanel').classList.toggle('hidden',choice!=='register');
 $('pinError').textContent='';$('registerError').textContent='';
 const has=NativeStore.hasPin()==='true';
 if(choice==='login'){
  $('lockText').textContent=has?'Devam etmek için PIN kodunuzu girin.':'Bu cihazda henüz kullanıcı kaydı yok. Önce yeni kayıt oluşturun.';
  $('pinButton').disabled=!has;$('pinButton').textContent='Giriş yap';
  if(has)setTimeout(()=>$('pinInput').focus(),120);
 }
 if(choice==='register'){
  const label=document.querySelector('label[for="regPin"]');
  if(label)label.textContent=has?'Cihaz güvenlik PIN’i *':'Yeni PIN (6–32 karakter) *';
  $('regPin').placeholder=has?'Mevcut cihaz PIN’i':'Yeni PIN';
  $('regPinConfirm').placeholder=has?'Cihaz PIN’ini tekrar yazın':'PIN’i tekrar yazın';
  $('regPin').autocomplete=has?'current-password':'new-password';
  $('regPinConfirm').autocomplete=has?'current-password':'new-password';
 }
}
function submitRegistration(event){
 if(event)event.preventDefault();
 const first=$('regFirstName').value.trim(),last=$('regLastName').value.trim(),
 email=$('regEmail').value.trim().toLowerCase(),phone=$('regPhone').value.trim(),
 role=$('regRole').value,office=$('regOffice').value.trim(),
 pin=$('regPin').value,confirmPin=$('regPinConfirm').value;
 const error=$('registerError');error.textContent='';
 const hasPin=NativeStore.hasPin()==='true';
 if(first.length<2||last.length<2)return error.textContent='Ad ve soyad en az 2 karakter olmalı.',false;
 if(!/^[^s@]+@[^s@]+.[^s@]+$/.test(email))return error.textContent='Geçerli bir e-posta adresi girin.',false;
 if(phone&&!/^[+0-9()\s-]{7,24}$/.test(phone))return error.textContent='Telefon numarasını kontrol edin.',false;
 if(!['accountant','business_owner','finance','employee','other'].includes(role))return error.textContent='Kullanıcı türünü seçin.',false;
 if(pin.length<6||pin.length>32)return error.textContent='PIN 6–32 karakter olmalı.',false;
 if(pin!==confirmPin)return error.textContent='PIN kodları eşleşmiyor.',false;
 if(!$('regLocalConsent').checked)return error.textContent='Yerel kayıt bilgilendirmesini onaylayın.',false;
 $('registerSubmit').disabled=true;
 try{
   if(hasPin){
    if(NativeStore.verifyPin(pin)!=='true')throw new Error('Cihaz güvenlik PIN’i yanlış.');
   }else{
    const setResult=NativeStore.setPin(pin);
    if(setResult!=='ok')throw new Error('Güvenlik PIN’i kaydedilemedi.');
   }
   let raw=NativeStore.loadData();
   if(raw==='__AUTH_REQUIRED__'||raw==='__DECRYPT_FAILED__')throw new Error('Şifreli kayıtlar açılamadı. Mevcut veriler korunuyor; destek alın.');
   db=normalizeDB(JSON.parse(raw||'{}'));
   const profile={id:newRecordId(),firstName:first,lastName:last,displayName:first+' '+last,
     email,phone,role,officeName:office,createdAt:new Date().toISOString(),
     updatedAt:new Date().toISOString(),registrationType:'local-device'};
   if(!Array.isArray(db.settings.userProfiles))db.settings.userProfiles=[];
   db.settings.userProfiles.push(profile);db.settings.userProfile=profile;
   if(office&&!db.settings.businessName)db.settings.businessName=office;
   unlocked=true;readOnlyRecovery=false;
   const saved=NativeStore.saveData(JSON.stringify(db));
   if(saved!=='ok')throw new Error('Kullanıcı bilgileri güvenli biçimde kaydedilemedi. Veriler korunuyor.');
   $('lock').classList.add('hidden');
   $('pinInput').value='';$('regPin').value='';$('regPinConfirm').value='';
   render();showView('dashboard');
   NativeStore.showMessage('Kullanıcı kaydı oluşturuldu. Hoş geldiniz, '+first+'.');
 }catch(e){
   error.textContent=String(e.message||e);
   if(NativeStore.hasPin()==='true')showAuthChoice('register');
 }finally{$('registerSubmit').disabled=false;}
 return false;
}
function roleLabel(role){return ({accountant:'Serbest muhasebeci mali müşavir',business_owner:'İşletme sahibi',finance:'Muhasebe / finans personeli',employee:'Personel',other:'Diğer'})[role]||'Kullanıcı';}
function renderUserProfile(){
 const p=db?.settings?.userProfile;if(!p)return;
 const values={profileFirstName:p.firstName,profileLastName:p.lastName,profileEmail:p.email,profilePhone:p.phone,profileRole:p.role,profileOffice:p.officeName};
 for(const [id,value] of Object.entries(values)){const el=$(id);if(el&&document.activeElement!==el)el.value=value||'';}
 const status=$('profileStatus');if(status)status.textContent='Kullanıcı: '+(p.displayName||'')+' • '+roleLabel(p.role)+' • Yerel kayıt';
}
function saveUserProfile(){
 if(!unlocked||readOnlyRecovery)return NativeStore.showMessage('Kullanıcı profili güncellenemiyor.');
 const first=$('profileFirstName').value.trim(),last=$('profileLastName').value.trim(),
 email=$('profileEmail').value.trim().toLowerCase(),phone=$('profilePhone').value.trim(),
 role=$('profileRole').value,office=$('profileOffice').value.trim();
 if(first.length<2||last.length<2)return NativeStore.showMessage('Ad ve soyad en az 2 karakter olmalı.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NativeStore.showMessage('Geçerli e-posta girin.');
 if(phone&&!/^[+0-9()\s-]{7,24}$/.test(phone))return NativeStore.showMessage('Telefon numarasını kontrol edin.');
 const old=db.settings.userProfile||{};
 db.settings.userProfile={...old,firstName:first,lastName:last,displayName:first+' '+last,
   email,phone,role,officeName:office,updatedAt:new Date().toISOString(),registrationType:'local-device'};
 persist();NativeStore.showMessage('Kullanıcı bilgileri güncellendi.');
}
function submitPin(){const p=$('pinInput').value;if(p.length<6){$('pinError').textContent='PIN en az 6 karakter olmalı.';return}if(NativeStore.hasPin()!=='true'){if(NativeStore.setPin(p)!=='ok'){$('pinError').textContent='PIN kaydedilemedi.';return}}else if(NativeStore.verifyPin(p)!=='true'){$('pinError').textContent='PIN hatalı.';return}
let raw='';try{raw=NativeStore.loadData()}catch(e){raw='__DECRYPT_FAILED__'}
if(raw==='__DECRYPT_FAILED__'){readOnlyRecovery=true;db=normalizeDB({});unlocked=true;$('lock').classList.add('hidden');$('pinInput').value='';$('pinError').textContent='';render();showView('settings');$('recoveryWarning').classList.remove('hidden');NativeStore.showMessage('Şifreli kayıtlar okunamadı. Veriler silinmedi. Yedekten geri yükleyin.');return}
try{db=normalizeDB(JSON.parse(raw||'{}'))}catch(e){readOnlyRecovery=true;db=normalizeDB({});unlocked=true;$('lock').classList.add('hidden');$('pinInput').value='';render();showView('settings');$('recoveryWarning').classList.remove('hidden');NativeStore.showMessage('Kayıt biçimi bozuk. Orijinal veri korunuyor. Yedekten geri yükleyin.');return}
readOnlyRecovery=false;unlocked=true;migrateLegacyData();$('lock').classList.add('hidden');$('pinInput').value='';$('pinError').textContent='';persist();$('appVersionText').textContent=NativeStore.getAppVersion();setTimeout(()=>checkForUpdates(false),900)}
function persist(){
 if(!unlocked)return false;
 if(readOnlyRecovery){
   NativeStore.showMessage('Kayıtlar koruma modunda. Önce yedekten geri yükleyin.');
   render();return false;
 }
 const result=NativeStore.saveData(JSON.stringify(db));
 if(result!=='ok'){
   if(result==='error_locked')readOnlyRecovery=true;
   NativeStore.showMessage('Kayıt güvenli biçimde saklanamadı. Veriler korunuyor.');
   render();return false;
 }
 render();return true;
}
let availableUpdate=null,updateCheckBusy=false;
function setUpdateStatus(message){if($('updateStatus'))$('updateStatus').textContent=message;if($('settingsUpdateStatus'))$('settingsUpdateStatus').textContent=message;}
function setUpdateButtons(visible){$('installUpdateButton')?.classList.toggle('hidden',!visible);$('settingsInstallUpdateButton')?.classList.toggle('hidden',!visible);}
function checkForUpdates(manual){if(updateCheckBusy)return;updateCheckBusy=true;availableUpdate=null;setUpdateButtons(false);setUpdateStatus('Güncellemeler kontrol ediliyor...');try{NativeStore.checkForUpdate(NativeStore.getAppVersion());}catch(e){updateCheckBusy=false;setUpdateStatus('Güncelleme kontrolü başlatılamadı.');if(manual)NativeStore.showMessage('Güncelleme kontrolü başlatılamadı.');}}
window.onUpdateCheckResult=function(result){updateCheckBusy=false;if(!result||!result.success){setUpdateStatus((result&&result.error)||'Güncelleme sunucusuna ulaşılamadı. İnternet bağlantısını kontrol edin.');return;}const current=String(result.currentVersion||NativeStore.getAppVersion()),latest=String(result.latestVersion||'');const parts=v=>v.replace(/^v/i,'').split(/[.-]/).map(x=>parseInt(x,10)||0);const a=parts(latest),b=parts(current);let newer=false;for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)>(b[i]||0)){newer=true;break;}if((a[i]||0)<(b[i]||0))break;}if(newer&&result.downloadUrl){availableUpdate=result;setUpdateStatus('Yeni sürüm bulundu: v'+latest+'. İndirmek için Güncelle butonuna bas.');if($('updateVersionBadge'))$('updateVersionBadge').textContent='Yeni v'+latest;setUpdateButtons(true);}else{availableUpdate=null;setUpdateStatus('Uygulaman güncel. Yüklü sürüm: v'+current);if($('updateVersionBadge'))$('updateVersionBadge').textContent='Güncel';setUpdateButtons(false);}};
function installAvailableUpdate(){if(!availableUpdate||!availableUpdate.downloadUrl){NativeStore.showMessage('Önce güncelleme kontrolü yapın.');return;}if(!confirm('Akıllı Muhasebe v'+availableUpdate.latestVersion+' indirilsin mi? İndirme tamamlanınca Android kurulum ekranı açılacak.'))return;setUpdateButtons(false);setUpdateStatus('Yeni APK indiriliyor...');NativeStore.downloadAndInstallUpdate(availableUpdate.downloadUrl,availableUpdate.digest||'');}
window.onUpdateDownloadProgress=function(p){if(!p)return;const pct=Number(p.percent)||0;setUpdateStatus('APK indiriliyor: %'+pct);};
window.onUpdateDownloadResult=function(result){if(!result||!result.success){setUpdateStatus((result&&result.message)||'APK indirilemedi.');setUpdateButtons(!!availableUpdate);return;}setUpdateStatus(result.message||'APK indirildi. Android kurulum ekranı açılıyor.');};
function lockApp(){unlocked=false;try{NativeStore.lockNative();}catch(_){}$('lock').classList.remove('hidden');$('pinInput').value='';$('pinError').textContent=''}
function changeSecurityPin(){
 if(!unlocked||readOnlyRecovery)return NativeStore.showMessage('Önce PIN ile giriş yapın.');
 const oldPin=prompt('Mevcut PIN kodunu girin:');if(!oldPin)return;
 const newPin=prompt('Yeni PIN (6–32 karakter):');if(!newPin)return;
 if(newPin.length<6||newPin.length>32)return NativeStore.showMessage('Yeni PIN 6–32 karakter olmalı.');
 const verify=prompt('Yeni PIN kodunu yeniden girin:');
 if(newPin!==verify)return NativeStore.showMessage('PIN kodları eşleşmedi.');
 const result=NativeStore.changePin(oldPin,newPin);
 NativeStore.showMessage(result==='ok'?'PIN kodu güncellendi.':result==='invalid_old'?'Eski PIN yanlış.':'PIN değiştirilemedi.');
}
function showView(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));render()}
function handleBack(){if(!$('modal').classList.contains('hidden'))closeForm();else if(!$('lock').classList.contains('hidden')){}else showView('dashboard')}
function accountOptions(){return scoped('accounts').map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')}
function employeeOptions(){return scoped('employees').map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('')}
function field(name,label,type='text',placeholder=''){
 const numeric=type==='number';
 const outputType=numeric?'text':type;
 return '<div class="field"><label>'+label+'</label><input name="'+name+'" type="'+outputType+'" placeholder="'+placeholder+'" '+
   (numeric?'inputmode="decimal" data-number="1" autocomplete="off"':'')+'></div>';
}
function selectField(name,label,options){return '<div class="field"><label>'+label+'</label><select name="'+name+'">'+options+'</select></div>'}
function openForm(kind,defaultType){formKind=kind;let f='';
if(kind==='company'){f='<div class="formgrid">'+field('name','Firma / mükellef adı')+selectField('type','İşletme türü','<option value="sole">Şahıs işletmesi</option><option value="limited">Limited şirket</option><option value="joint">Anonim şirket</option><option value="other">Diğer</option>')+field('taxOffice','Vergi dairesi')+field('taxNo','Vergi numarası / TCKN')+field('phone','Telefon','tel')+field('email','E-posta','email')+field('fiscalYear','Mali yıl','number',String(new Date().getFullYear()))+field('address','Adres')+'</div>'}
if(kind==='transaction'){f='<div class="formgrid">'+field('description','Açıklama','text','Örn. Danışmanlık ücreti')+field('amount','Tutar (TL)','number')+selectField('type','İşlem türü','<option value="income" '+(defaultType==='income'?'selected':'')+'>Gelir</option><option value="expense" '+(defaultType==='expense'?'selected':'')+'>Gider</option>')+field('date','Tarih','date')+field('category','Kategori','text','Genel')+field('party','İlgili kişi / firma')+selectField('accountId','Kasa / banka hesabı',accountOptions())+'</div>'}
if(kind==='customer'){f='<div class="formgrid">'+field('name','Adı / Firma adı')+selectField('type','Cari türü','<option value="customer">Müşteri</option><option value="supplier">Tedarikçi</option><option value="both">Her ikisi</option>')+field('taxNo','TCKN / Vergi no')+field('phone','Telefon','tel')+field('email','E-posta','email')+field('openingReceivable','Açılış müşteri alacağı (TL)','number')+field('openingPayable','Açılış tedarikçi borcu (TL)','number')+field('address','Adres')+'</div>'}
if(kind==='invoice'){f='<div class="formgrid">'+field('number','Fatura numarası')+field('party','Müşteri / Tedarikçi')+selectField('customerId','Cari hesap',customerOptions())+field('taxNo','Vergi numarası / TCKN')+selectField('type','Fatura türü','<option value="sale">Satış</option><option value="purchase">Alış</option>')+field('date','Fatura tarihi','date')+field('dueDate','Vade tarihi','date')+field('net','KDV hariç tutar (TL)','number')+field('vatRate','KDV oranı (%)','number','20')+selectField('status','Durum','<option value="unpaid">Ödenmedi</option><option value="paid">Ödendi</option><option value="partial">Kısmen ödendi</option>')+field('paidAmount','Tahsil edilen / ödenen tutar (TL)','number')+selectField('accountId','Tahsilat / ödeme hesabı',accountOptions())+'</div><p class="muted">KDV ve genel toplam, girilen orana göre hesaplanır. Ödenen tutarı girersen cari ve kasa hareketi de oluşur.</p>'}
if(kind==='employee'){f='<div class="formgrid">'+field('name','Ad soyad')+field('title','Görev / Ünvan')+field('identity','TCKN')+field('phone','Telefon','tel')+field('startDate','İşe giriş tarihi','date')+field('gross','Aylık brüt ücret (TL)','number')+'</div>'}
if(kind==='payroll'){f='<div class="formgrid">'+selectField('employeeId','Personel',employeeOptions())+field('period','Dönem (YYYY-AA)','month')+field('gross','Brüt ücret (TL)','number')+field('extras','Ek ödeme (TL)','number')+field('deductions','Girilen kesintiler (TL)','number')+'</div><p class="muted">Net ön hesap: brüt + ek ödeme - girilen kesintiler.</p>'}
if(kind==='account'){f='<div class="formgrid">'+field('name','Hesap adı')+selectField('kind','Hesap türü','<option value="cash">Kasa</option><option value="bank">Banka</option><option value="other">Diğer</option>')+field('opening','Açılış bakiyesi (TL)','number')+'</div>'}
if(kind==='asset'){f='<div class="formgrid">'+field('name','Demirbaş / varlık adı')+field('purchaseDate','Alış tarihi','date')+field('cost','Alış bedeli (TL)','number')+field('life','Kullanım ömrü (yıl)','number')+'</div>'}
if(kind==='reminder'){f='<div class="formgrid">'+field('title','Hatırlatma başlığı')+field('date','Son tarih','date')+field('note','Not')+'</div>'}
if(kind==='settlement'){f='<div class="formgrid">'+selectField('customerId','Cari hesap',customerOptions())+selectField('direction','İşlem','<option value="receipt">Müşteriden tahsilat</option><option value="payment">Tedarikçiye ödeme</option>')+field('amount','Tutar (TL)','number')+field('date','Tarih','date')+selectField('accountId','Kasa / banka hesabı',accountOptions())+field('note','Açıklama')+'</div>'}
if(kind==='voucher'){f='<div class="formgrid">'+field('voucherNo','Fiş numarası','text',nextVoucherNo())+field('date','Tarih','date')+selectField('type','Fiş türü','<option value="Mahsup">Mahsup</option><option value="Tahsilat">Tahsilat</option><option value="Tediye">Tediye</option>')+field('description','Açıklama')+field('party','İlgili kişi / firma')+selectField('debitCode','Borç hesabı',chartOptions())+selectField('creditCode','Alacak hesabı',chartOptions())+field('amount','Tutar (TL)','number')+'</div><p class="muted">Tek borç ve tek alacak satırı oluşturulur; fiş toplamları otomatik eşitlenir.</p>'}
if(kind==='instrument'){f='<div class="formgrid">'+selectField('type','Belge türü','<option value="check">Çek</option><option value="promissory">Senet</option>')+selectField('direction','Portföy yönü','<option value="receivable">Alınan</option><option value="payable">Verilen</option>')+field('party','İlgili kişi / firma')+field('number','Çek / senet numarası')+field('bank','Banka / şube')+field('issueDate','Düzenleme tarihi','date')+field('dueDate','Vade tarihi','date')+field('amount','Tutar (TL)','number')+selectField('status','Durum','<option value="pending">Bekliyor</option><option value="paid">Ödendi / tahsil edildi</option><option value="endorsed">Ciro edildi</option><option value="bounced">Karşılıksız</option><option value="returned">İade edildi</option>')+field('note','Not')+'</div>'}
$('formTitle').textContent=({company:'Mükellef / firma ekle',transaction:'Gelir / gider kaydı',customer:'Cari hesap ekle',invoice:'Fatura kaydı',employee:'Personel kaydı',payroll:'Bordro ön hesabı',account:'Kasa / banka hesabı',asset:'Demirbaş / varlık kaydı',reminder:'Hatırlatma ekle',settlement:'Tahsilat / ödeme kaydı',voucher:'Muhasebe fişi',instrument:'Çek / senet kaydı'})[kind]||'Yeni kayıt';
$('formBody').innerHTML=f+'<button class="btn" style="width:100%;margin-top:10px" onclick="saveForm()">Kaydet</button>';$('formBody').querySelectorAll('input[type=date]').forEach(x=>x.value=dateToday());$('formBody').querySelectorAll('input[type=month]').forEach(x=>x.value=dateToday().slice(0,7));if(kind==='invoice'&&pendingOcr){const values={number:pendingOcr.number,party:pendingOcr.party,taxNo:pendingOcr.taxNo,date:pendingOcr.date,net:pendingOcr.net,vatRate:pendingOcr.vatRate};Object.entries(values).forEach(([key,value])=>{const input=$('formBody').querySelector('[name="'+key+'"]');if(input&&value!==''&&value!==null&&value!==undefined)input.value=value;});}if(kind==='invoice'){const customerSelect=$('formBody').querySelector('[name="customerId"]');if(customerSelect)customerSelect.addEventListener('change',()=>{const c=scoped('customers').find(x=>Number(x.id)===Number(customerSelect.value));const party=$('formBody').querySelector('[name="party"]');if(c&&party)party.value=c.name;});} $('modal').classList.remove('hidden')}
function closeForm(){$('modal').classList.add('hidden')}
function readForm(){
 const values={};
 $('formBody').querySelectorAll('input,select').forEach(x=>{
   if(!x.name)return;
   if(x.dataset.number&&x.value.trim()!==''){
     const n=DocumentParser.number(x.value.trim());
     values[x.name]=Number.isFinite(n)?String(n):x.value;
   }else values[x.name]=x.value;
 });
 return values;
}
let pendingOcr=null,pendingOcrSourceDocumentId=0,editingDocumentId=0;
function takePhotoInApp(){
  if(!unlocked)return NativeStore.showMessage('Önce şifre ile giriş yapın.');
  if(readOnlyRecovery)return NativeStore.showMessage('Kayıt koruma modunda. Yedeği geri yükleyin.');
  pendingOcr=null;editingDocumentId=0;
  if($('ocrPreview'))$('ocrPreview').classList.add('hidden');
  if($('ocrStatus'))$('ocrStatus').textContent='Uygulama içi kamera açılıyor...';
  try{NativeStore.openInvoiceCamera()}catch(e){NativeStore.showMessage('Kamera açılamadı. Uygulama izinlerini kontrol edin.');}
}
window.onEmbeddedCameraStatus=function(data){
  const message=data?.message||'Kamera kapatıldı.';
  if(data?.accepted){showView('invoices');if($('ocrPreview'))$('ocrPreview').classList.add('hidden');}
  if($('ocrStatus'))$('ocrStatus').textContent=message;
};
function handleInvoiceImage(event){const file=event.target.files&&event.target.files[0];if(!file)return;if(!file.type.startsWith('image/')){NativeStore.showMessage('Lütfen JPG, PNG veya WEBP fotoğrafı seçin.');return;}if(file.size>15000000){NativeStore.showMessage('Fotoğraf 15 MB sınırını aşıyor. Daha küçük bir fotoğraf seçin.');return;}$('ocrStatus').textContent='Fotoğraf hazırlanıyor...';$('ocrPreview').classList.add('hidden');const reader=new FileReader();reader.onload=()=>{const data=String(reader.result||'').split(',')[1];if(!data){$('ocrStatus').textContent='Fotoğraf okunamadı.';return;}$('ocrStatus').textContent='Fatura metni cihazda okunuyor...';NativeStore.recognizeInvoiceImage(data);};reader.onerror=()=>$('ocrStatus').textContent='Fotoğraf dosyası açılamadı.';reader.readAsDataURL(file);}
window.onInvoiceOcrResult=function(result){
  if(!result||!result.success){$('ocrStatus').textContent=(result&&result.error)||'Belge okunamadı.';return;}
  const text=String(result.text||'');
  if(!text.trim()){$('ocrStatus').textContent='Okunabilir yazı bulunamadı. Daha net fotoğraf veya PDF deneyin.';return;}
  try{
    if(!window.DocumentParser)throw new Error('Belge ayrıştırıcısı yüklenmedi.');
    pendingOcr=DocumentParser.parseDocument(text,result.lines||[]);
    editingDocumentId=0;
    pendingOcr.text=text;
    pendingOcrSourceDocumentId=0;
    $('ocrText').textContent=text;
    renderOcrReview();
    $('ocrStatus').textContent='Belge okundu. Otomatik aktarılan bilgileri düzeltip onaylayın.';
    $('ocrPreview').classList.remove('hidden');
  }catch(e){$('ocrStatus').textContent='Belge alanları ayrıştırılamadı: '+String(e.message||e);}
};
function parseTurkishMoney(value){if(!value)return 0;let s=String(value).replace(/[^0-9,.-]/g,'');if(!s)return 0;const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');if(comma>-1&&dot>-1){if(comma>dot)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(comma>-1){const decimals=s.length-comma-1;s=decimals===2?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');}else if(dot>-1){const decimals=s.length-dot-1;if(decimals!==2)s=s.replace(/\./g,'');}const n=Number(s);return Number.isFinite(n)?n:0;}
function findInvoiceAmount(text,labels){for(const label of labels){const re=new RegExp(label+'(?:\\s*\\(?\\s*%?\\s*\\d{1,2}\\s*%?\\s*\\)?)?\\s*[:\\-]?\\s*(?:₺|TL)?\\s*([0-9][0-9.,]*)','i');const m=text.match(re);if(m){const value=parseTurkishMoney(m[1]);if(value>0)return value;}}return 0;}
function parseInvoiceText(text){const tax=(text.match(/(?:VKN|Vergi\s*No\.?|Vergi\s*Numarası|TCKN|T\.?C\.?\s*Kimlik\s*No)\s*[:\-]?\s*(\d{10,11})/i)||[])[1]||'';const number=(text.match(/(?:Fatura\s*(?:No|Numarası|Numarasi)|Belge\s*No|Invoice\s*No)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i)||[])[1]||'';let dateText=(text.match(/(?:Fatura\s*Tarihi|Düzenleme\s*Tarihi|Belge\s*Tarihi)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i)||[])[1]||'';if(!dateText)dateText=(text.match(/\b(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})\b/)||[])[1]||'';let iso='';if(dateText){const p=dateText.split(/[.\/-]/);if(p.length===3)iso=p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');}
let vatRate=(text.match(/(?:KDV|KDV Oranı|KDV Orani)\s*[:(]?\s*%?\s*(\d{1,2})\s*%?/i)||[])[1]||'';if(!vatRate){const m=text.match(/%\s*(\d{1,2})\b/);if(m)vatRate=m[1];}
const net=findInvoiceAmount(text,['Mal\\s*Hizmet\\s*Toplam\\s*Tutarı','Mal\\s*Hizmet\\s*Toplam\\s*Tutari','Vergi\\s*Hariç\\s*(?:Toplam\\s*)?Tutarı','Vergi\\s*Haric\\s*(?:Toplam\\s*)?Tutari','Ara\\s*Toplam','Matrah']);const vat=findInvoiceAmount(text,['Hesaplanan\\s*KDV','Toplam\\s*KDV','KDV\\s*Tutarı','KDV\\s*Tutari']);const total=findInvoiceAmount(text,['Vergiler\\s*Dahil\\s*Toplam\\s*Tutarı','Vergiler\\s*Dahil\\s*Toplam\\s*Tutari','Ödenecek\\s*Tutar','Odenecek\\s*Tutar','Genel\\s*Toplam','Toplam\\s*Tutar']);let finalNet=net;if(!finalNet&&total&&vat)finalNet=Math.max(0,total-vat);if(!finalNet&&total&&vatRate)finalNet=total/(1+Number(vatRate)/100);if(!finalNet&&vat&&vatRate)finalNet=vat*100/Number(vatRate);
const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const party=lines.find(x=>x.length>2&&x.length<70&&!/FATURA|E-ARŞİV|E-FATURA|SAYIN|TARİH|TARIH|VERGİ|VERGI|VKN|TCKN|TOPLAM|KDV|HESAPLANAN|MAL HİZMET|MAL HIZMET|TUTAR|MATRAH|ÖDENECEK|ODENECEK|TEL|ADRES/i.test(x))||'';
return {number,party,taxNo:tax,date:iso,net:finalNet?finalNet.toFixed(2):'',vatRate:vatRate?String(Number(vatRate)):'',vat,total};}
function useOcrInvoice(){
  if(!pendingOcr)return;
  const reviewed=readReviewedDocument();
  if(!['einvoice','invoice'].includes(reviewed.documentType)){NativeStore.showMessage('İrsaliye, POS slipi veya fiş faturaya otomatik dönüştürülemez. Önce belge türünü kontrol edin.');return;}
  if(!reviewed.party||reviewed.total<=0)return NativeStore.showMessage('Firma adı ve toplam tutarı kontrol et.');
  const rates=new Set((reviewed.items||[]).map(i=>i.vatRate).filter(x=>x!==null&&x!==undefined&&x!=='').map(Number));
  if(rates.size>1)return NativeStore.showMessage('Birden fazla KDV oranı var. Belgeyi arşive kaydet; tek oranlı fatura taslağına otomatik aktarma güvenli değil.');
  if(reviewed.net!==null&&reviewed.vat!==null&&Math.abs(AccountingRules.round(reviewed.net+reviewed.vat)-reviewed.total)>0.06)
    return NativeStore.showMessage('Matrah + KDV ve genel toplam uyuşmuyor; faturayı kontrol edin.');
  pendingOcr={...reviewed,text:pendingOcr.text,sourceDocumentId:pendingOcrSourceDocumentId};
  openForm('invoice');
}
function clearOcr(){pendingOcr=null;pendingOcrSourceDocumentId=0;editingDocumentId=0;$('invoiceImage').value='';if($('invoicePdf'))$('invoicePdf').value='';$('ocrPreview').classList.add('hidden');$('ocrStatus').textContent='Henüz fotoğraf veya PDF seçilmedi.';}

