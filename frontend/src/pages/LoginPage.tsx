import { useAuth } from '../context/AuthContext';
import { AuthForm } from './AuthForm';

export function LoginPage() {
  const { login } = useAuth();
  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      altText="No account yet?"
      altTo="/register"
      altLabel="Create one"
      onSubmit={login}
    />
  );
}
