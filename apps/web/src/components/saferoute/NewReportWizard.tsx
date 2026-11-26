"use client";

import { createReportSchema, type DuplicateDto, type ReportCategory, type ReportDetailDto } from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Banner,
  Button,
  Card,
  CategoryTile,
  IconButton,
  ImageUploader,
  Stepper,
  TextArea,
  TextField,
  useToast,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { CATEGORY_META, CATEGORY_ORDER, categoryLabel, newIdempotencyKey, peopleConfirmed } from "@/lib/saferoute";
import { useReportPhotos } from "@/lib/report-upload";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";

const DRAFT_KEY = "ss_report_draft";

interface Draft {
  step: number;
  category: ReportCategory;
  location: PickedLocation | null;
  title: string;
  description: string;
}

const EMPTY_DRAFT: Draft = { step: 1, category: "BROKEN_STREETLIGHT", location: null, title: "", description: "" };

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      step: typeof d.step === "number" && d.step >= 1 && d.step <= 4 ? d.step : 1,
      category: d.category && d.category in CATEGORY_META ? d.category : EMPTY_DRAFT.category,
      location: d.location ?? null,
      title: typeof d.title === "string" ? d.title : "",
      description: typeof d.description === "string" ? d.description : "",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const STEP_TITLE = ["What's the problem?", "Where is it?", "Add details", "Check and submit"] as const;

/** S7 / A5.3: four-step report flow in a centred 520 px column. Draft lives in localStorage. */
export default function NewReportWizard() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [initial] = useState(readDraft);
  const [step, setStep] = useState(initial.step);
  const [category, setCategory] = useState<ReportCategory>(initial.category);
  const [location, setLocation] = useState<PickedLocation | null>(initial.location);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [errors, setErrors] = useState<{ location?: string; title?: string; description?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(newIdempotencyKey);
  const photos = useReportPhotos();

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, category, location, title, description }));
    } catch {
      /* storage unavailable */
    }
  }, [step, category, location, title, description]);

  const dupQuery = useQuery({
    queryKey: ["report-duplicates", location?.lat, location?.lng, category],
    queryFn: () =>
      api<{ data: DuplicateDto[] }>(
        `/reports/nearby-duplicates?lat=${location!.lat}&lng=${location!.lng}&category=${category}`,
      ),
    enabled: step === 2 && location !== null,
    retry: false,
  });
  const duplicate = dupQuery.data?.data[0];

  const confirmInstead = useMutation({
    mutationFn: (id: string) => api(`/reports/${id}/confirm`, { method: "POST" }),
    onSuccess: (_d, id) => {
      clearDraft();
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      setFlash("Confirmation added.");
      router.push(`/saferoute/${id}`);
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "We couldn't add that. Try again.", "error"),
  });

  const submit = useMutation({
    mutationFn: () =>
      api<{ data: ReportDetailDto }>("/reports", {
        method: "POST",
        headers: { "Idempotency-Key": attempt },
        body: {
          category,
          title: title.trim(),
          description: description.trim(),
          latitude: location!.lat,
          longitude: location!.lng,
          ...(location!.address.trim() ? { addressText: location!.address.trim() } : {}),
          photoUploadIds: photos.uploadIds,
        },
      }),
    onSuccess: (res) => {
      clearDraft();
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      setFlash("Report submitted.");
      router.push(`/saferoute/${res.data.id}`);
    },
    onError: (err) => {
      setAttempt(newIdempotencyKey());
      if (err instanceof ApiError && err.fieldError("latitude")) {
        setErrors({ location: err.fieldError("latitude") ?? err.message });
        setStep(2);
        return;
      }
      setSubmitError(err instanceof ApiError ? err.message : "We couldn't submit your report. Try again.");
    },
  });

  function next() {
    if (step === 2 && !location) {
      setErrors({ location: "Drop a pin on the map or search for the place." });
      return;
    }
    if (step === 3) {
      const parsed = createReportSchema.pick({ title: true, description: true }).safeParse({ title, description });
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        setErrors({
          ...(flat.title ? { title: "Use 5 to 80 characters for the title." } : {}),
          ...(flat.description ? { description: "Use 10 to 1000 characters for the description." } : {}),
        });
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(4, s + 1));
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    if (step === 1) router.push("/saferoute");
    else setStep((s) => s - 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
      {!online ? (
        <Banner tone="amber-warn" icon="alert">
          You&apos;re offline. Changes won&apos;t be saved.
        </Banner>
      ) : null}

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <IconButton icon="back" label={step === 1 ? "Back to reports" : "Previous step"} onClick={back} />
          <h1 className="type-h3 flex-1">Report an issue</h1>
          <p className="text-[14px] leading-5 text-text-secondary">{step} of 4</p>
        </div>
        <Stepper step={step} label="Report progress" />
      </header>

      <section aria-labelledby="step-title" className="flex flex-col gap-4">
        <div>
          <h2 id="step-title" className="type-h3">
            {STEP_TITLE[step - 1]}
          </h2>
          {step === 1 ? (
            <p className="text-[14px] leading-5 text-text-secondary">
              Pick the closest match. You can add details next.
            </p>
          ) : null}
        </div>

        {step === 1 ? (
          <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-3">
            {CATEGORY_ORDER.map((c) => (
              <CategoryTile
                key={c}
                icon={CATEGORY_META[c].icon}
                label={CATEGORY_META[c].label}
                selected={category === c}
                onSelect={() => setCategory(c)}
              />
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <LocationPicker
              value={location}
              onChange={(v) => {
                setLocation(v);
                if (v) setErrors({});
              }}
            />
            {errors.location ? (
              <p role="alert" className="flex items-start gap-1 text-[14px] leading-5 text-coral-text">
                <Icon name="error" size={16} className="mt-0.5 shrink-0" />
                {errors.location}
              </p>
            ) : null}
            {duplicate ? (
              <div
                className="flex flex-col gap-3 rounded-banner border border-amber-warn-border bg-amber-warn-bg p-4"
                data-testid="duplicate-card"
              >
                <div>
                  <p className="text-[14px] leading-5 font-semibold text-ink">Is this the same issue?</p>
                  <p className="text-[12px] leading-4 text-text-secondary">
                    {categoryLabel(duplicate.category)} · {Math.round(duplicate.distanceM)} m away ·{" "}
                    {peopleConfirmed(duplicate.confirmationCount)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  fullWidth
                  loading={confirmInstead.isPending}
                  onClick={() => confirmInstead.mutate(duplicate.id)}
                >
                  Confirm that report instead
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <TextField
              label="Title"
              hint="A few words, 5 to 80 characters."
              maxLength={80}
              value={title}
              error={errors.title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <TextArea
              label="Description"
              maxLength={1000}
              counter={{ value: description.length, max: 1000 }}
              value={description}
              error={errors.description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <p className="text-[14px] leading-5 font-medium">
                Photos <span className="font-normal text-text-secondary">(optional)</span>
              </p>
              <ImageUploader items={photos.photos} onAdd={photos.add} onRemove={photos.remove} error={photos.error} />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <Card className="flex flex-col gap-3" data-testid="review-card">
            <div className="flex items-center gap-2 text-[14px] leading-5 font-medium">
              <Icon name={CATEGORY_META[category].icon} size={18} />
              {CATEGORY_META[category].label}
            </div>
            <div>
              <p className="type-h3">{title.trim()}</p>
              <p className="mt-1 text-[14px] leading-5 whitespace-pre-line text-text-secondary">{description.trim()}</p>
            </div>
            <div className="flex items-start gap-2 text-[14px] leading-5">
              <Icon name="saferoute" size={18} className="mt-0.5 shrink-0" />
              <span>
                {location?.address.trim() || "Pinned location"}
                <span className="block text-[12px] leading-4 text-text-secondary">
                  {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : ""}
                </span>
              </span>
            </div>
            <p className="text-[12px] leading-4 text-text-secondary">
              {photos.uploadIds.length} {photos.uploadIds.length === 1 ? "photo" : "photos"} attached. Reports are shown
              as unverified until a moderator checks them.
            </p>
          </Card>
        ) : null}

        {submitError ? (
          <Banner tone="amber-warn" icon="alert">
            {submitError}
          </Banner>
        ) : null}

        {step < 4 ? (
          <Button size="mobile" fullWidth trailingArrow disabled={step === 3 && photos.uploading} onClick={next}>
            Continue
          </Button>
        ) : (
          <Button
            size="mobile"
            fullWidth
            loading={submit.isPending}
            disabled={!online || !location}
            onClick={() => {
              setSubmitError(null);
              submit.mutate();
            }}
          >
            Submit report
          </Button>
        )}
        <p className="text-center text-[12px] leading-4 text-text-secondary">Your draft is saved on this device.</p>
      </section>
    </div>
  );
}
