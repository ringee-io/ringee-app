"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const t = useTranslations("common");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal
      title={t("areYouSure")}
      description={t("cannotBeUndone")}
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="flex w-full items-center justify-end space-x-2 pt-6">
        <Button disabled={loading} variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button disabled={loading} variant="destructive" onClick={onConfirm}>
          {t("continue")}
        </Button>
      </div>
    </Modal>
  );
};
