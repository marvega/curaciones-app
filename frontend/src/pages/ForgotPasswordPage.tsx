import { useState } from 'react';
import { forgotPassword } from '../services/api';
import { Button, Input, Card, PageHeader } from '../components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader title="¿Olvidaste tu contraseña?" />
      <Card>
        {sent ? (
          <p>Si ese email existe en el sistema, recibirás un correo con instrucciones.</p>
        ) : (
          <div className="space-y-3">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              disabled={!email || submitting}
              loading={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await forgotPassword(email);
                } finally {
                  setSubmitting(false);
                  setSent(true);
                }
              }}
            >
              Enviar link
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
