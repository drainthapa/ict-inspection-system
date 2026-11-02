import Modal from './Modal.jsx';
import Button from './Button.jsx';

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      )}
    >
      <p className="text-slate-700">{message}</p>
    </Modal>
  );
}
