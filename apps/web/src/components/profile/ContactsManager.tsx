"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MAX_EMERGENCY_CONTACTS, emailSchema, phoneSchema, text, type EmergencyContactDto } from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconBubble,
  Modal,
  Skeleton,
  TextField,
  useToast,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";

const schema = z.object({
  name: text(1, 60),
  relationship: z.string().trim().max(40),
  email: emailSchema,
  phone: z.union([z.literal(""), phoneSchema]),
  consentConfirmed: z.boolean().refine((v) => v, "Confirm you have told this person."),
});
type Values = z.infer<typeof schema>;

const KEY = ["contacts"] as const;

export function ContactForm({ initial, onDone }: { initial?: EmergencyContactDto; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      relationship: initial?.relationship ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone?.replace("+91", "") ?? "",
      consentConfirmed: initial ? true : false,
    },
  });

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        name: v.name,
        relationship: v.relationship || null,
        email: v.email,
        phone: v.phone || null,
        consentConfirmed: true,
      };
      return initial
        ? api(`/me/contacts/${initial.id}`, { method: "PATCH", body })
        : api("/me/contacts", { method: "POST", body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.show(initial ? "Contact updated." : "Contact added.");
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const email = err.fieldError("email");
        if (email) setError("email", { message: email });
        else setFormError(err.message);
      } else setFormError("Something went wrong. Try again.");
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="flex flex-col gap-4">
      <TextField label="Name" {...(errors.name ? { error: "Enter a name." } : {})} {...register("name")} />
      <TextField label="Relationship" optional placeholder="Mother, friend, flatmate" {...register("relationship")} />
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        hint="This is where we send journey updates. It can't be your own email."
        {...(errors.email ? { error: errors.email.message ?? "Enter a valid email address." } : {})}
        {...register("email")}
      />
      <TextField
        label="Phone"
        optional
        type="tel"
        inputMode="tel"
        hint="Used for the call button during a journey."
        {...(errors.phone ? { error: "Enter a 10-digit Indian mobile number." } : {})}
        {...register("phone")}
      />
      <Checkbox
        label="I have told this person they may get emails from SaferStreets."
        {...(errors.consentConfirmed ? { error: errors.consentConfirmed.message ?? "Confirm to continue." } : {})}
        {...register("consentConfirmed")}
      />
      {formError ? (
        <Banner tone="amber-warn" icon="alert">
          {formError}
        </Banner>
      ) : null}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button type="button" variant="secondary" size="mobile" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="mobile" loading={save.isPending}>
          {initial ? "Save contact" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}

/** S19: trusted contacts list with add, edit and delete. Max 5, consent required. Shared with Settings. */
export function ContactsManager() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<EmergencyContactDto | "new" | null>(null);
  const [removing, setRemoving] = useState<EmergencyContactDto | null>(null);

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => api<{ data: EmergencyContactDto[] }>("/me/contacts").then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/me/contacts/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.show("Contact removed.");
      setRemoving(null);
    },
    onError: () => {
      toast.show("We couldn't remove that contact. Try again.", "error");
      setRemoving(null);
    },
  });

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (list.isError)
    return (
      <ErrorState
        onRetry={() => void list.refetch()}
        {...(list.error instanceof ApiError ? { code: list.error.code } : {})}
      />
    );

  const contacts = list.data;
  const full = contacts.length >= MAX_EMERGENCY_CONTACTS;

  return (
    <div className="flex flex-col gap-4">
      {contacts.length === 0 ? (
        <Card>
          <EmptyState
            art="quiet"
            title="No trusted contacts yet"
            description="Add someone who should hear from SaferStreets if you start a journey. They get email updates and a status link, never your live location."
            actionLabel="Add a contact"
            onAction={() => setEditing("new")}
          />
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li key={c.id}>
                <Card className="flex items-center gap-3">
                  <IconBubble icon="mail" tone="mint" variant="tint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] leading-5 font-medium">
                      {c.name}
                      {c.relationship ? (
                        <span className="font-normal text-text-secondary"> · {c.relationship}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] leading-4 text-text-secondary">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                    {c.unsubscribed ? (
                      <p className="text-[12px] leading-4 text-coral-text">This person stopped receiving emails.</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRemoving(c)}
                      aria-label={`Remove ${c.name}`}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-[12px] leading-4 text-text-secondary">
              {contacts.length} of {MAX_EMERGENCY_CONTACTS} saved.
              {full ? " Remove one to add another." : ""}
            </p>
            <Button size="mobile" disabled={full} onClick={() => setEditing("new")} leadingIcon="mail">
              Add a contact
            </Button>
          </div>
        </>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add a trusted contact" : "Edit contact"}
      >
        {editing !== null ? (
          <ContactForm {...(editing !== "new" ? { initial: editing } : {})} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this contact"}?`}
        description="They won't get future journey emails from you."
        confirmLabel="Remove contact"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}
