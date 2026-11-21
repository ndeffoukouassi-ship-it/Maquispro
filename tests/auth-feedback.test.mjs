import test from 'node:test';
import assert from 'node:assert/strict';
import {EMAIL_RETRY_MINUTES,EMAIL_LIMIT_MINUTES,emailRateLimit,authMessage,waitLabel} from '../web-supabase/src/auth-feedback.mjs';
test('Retour explicite quand Supabase refuse une demande par quota',()=>{
  assert.equal(emailRateLimit({status:429,code:'over_email_send_rate_limit'}),true);
  assert.equal(emailRateLimit({message:'email rate limit exceeded'}),true);
  assert.equal(emailRateLimit({code:'invalid_credentials'}),false);
  assert.match(authMessage({code:'over_email_send_rate_limit'}),/limite/);
});
test('Lien expiré et connexion incorrecte : message compréhensible',()=>{
  assert.match(authMessage({code:'otp_expired'}),/expiré/);
  assert.match(authMessage({message:'One-time token not found'}),/expiré/);
  assert.match(authMessage({message:'Invalid login credentials'}),/mot de passe/);
  assert.match(authMessage({message:'Email not confirmed'}),/confirmée/);
});
test('Délais d’interface et affichage du temps restant',()=>{
  assert.equal(EMAIL_RETRY_MINUTES,5);
  assert.equal(EMAIL_LIMIT_MINUTES,60);
  assert.equal(waitLabel(1),'1 minute');
  assert.equal(waitLabel(90001),'2 minutes');
  assert.equal(waitLabel(0),'');
});
