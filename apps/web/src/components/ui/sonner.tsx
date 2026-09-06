import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      richColors
      closeButton
      containerAriaLabel="通知"
      toastOptions={{
        closeButtonAriaLabel: '关闭通知',
        style: { fontFamily: 'inherit' },
        classNames: {
          toast: 'app-toast',
          description: 'whitespace-pre-wrap break-words'
        }
      }}
    />
  );
}
