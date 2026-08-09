import { useAuth } from '../context/AuthContext';
import { AuthForm } from './AuthForm';

export function RegisterPage() {
  const { register } = useAuth();
  return (
    <AuthForm
      title="Create your account"
      submitLabel="Create account"
      altText="Already registered?"
      altTo="/login"
      altLabel="Sign in"
      onSubmit={register}
    />
  );
}
