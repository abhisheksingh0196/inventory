import { cloneElement, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { UploadIcon } from "lucide-react";
import { ClientOnly } from "remix-utils/client-only";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import { isFormProcessing } from "~/utils/form";
import { tw } from "~/utils/tw";
import Input from "../forms/input";
import { Dialog, DialogPortal } from "../layout/dialog";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";
import When from "../when/when";
import SuccessAnimation from "../zxing-scanner/success-animation";

type ImportUsersDialogProps = {
  className?: string;
  trigger?: React.ReactElement<{ onClick: () => void }>;
};

export default function ImportUsersDialog({
  className,
  trigger,
}: ImportUsersDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [error, setError] = useState<string>("");

  const navigate = useNavigate();

  const fetcher = useFetcherWithReset<{
    error?: { message?: string };
    success?: boolean;
  }>();
  const disabled = isFormProcessing(fetcher.state);

  function openDialog() {
    setIsDialogOpen(true);
  }

  function closeDialog() {
    fetcher.reset();
    setIsDialogOpen(false);
  }

  function handleSelectFile(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");

    const file = event.target.files?.[0];
    if (file?.type !== "text/csv") {
      setError("Invalid file type. Please select a CSV file.");
      return;
    }

    setSelectedFile(file);
  }

  function goToInvites() {
    navigate("/settings/team/invites");
    closeDialog();
  }

  return (
    <>
      {trigger ? (
        cloneElement(trigger, { onClick: openDialog })
      ) : (
        <Button
          variant="secondary"
          className="mt-2 w-full md:mt-0 md:w-max"
          onClick={openDialog}
        >
          <span className="whitespace-nowrap">Import Users</span>
        </Button>
      )}

      <DialogPortal>
        <Dialog
          className={tw(
            "overflow-auto",
            !fetcher.data?.success &&
              "h-[calc(100vh_-_50px)] md:w-[calc(100vw_-_200px)]",
            className
          )}
          open={isDialogOpen}
          onClose={closeDialog}
          title={
            <div className="mt-4 inline-flex items-center justify-center rounded-full border-4 border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
              <UploadIcon />
            </div>
          }
        >
          {fetcher.data?.success || true ? (
            <div className="flex flex-col items-center justify-center px-6 pb-4 pt-2 text-center">
              <div className="mb-4 ">
                <ClientOnly fallback={null}>
                  {() => <SuccessAnimation />}
                </ClientOnly>
              </div>

              <h4>Successfully invited users</h4>
              <p className="mb-4">
                Users from the csv file has been invited successfully.
              </p>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={closeDialog}>
                  Close
                </Button>
                <Button onClick={goToInvites}>View Invites</Button>
              </div>
            </div>
          ) : (
            <div className="px-6 pb-4 pt-2">
              <h3>Invite Users via CSV Upload</h3>
              <p>
                Invite multiple users to your organization by uploading a CSV
                file. To get started,{" "}
                <Button
                  variant="link"
                  to="/static/shelf.nu-example-import-users-from-content.csv"
                  target="_blank"
                  download
                >
                  download our CSV template.
                </Button>
              </p>
              <WarningBox className="my-4">
                <>
                  <strong>IMPORTANT</strong>: Use the provided template to
                  ensure proper formatting. Uploading incorrectly formatted
                  files may cause errors.
                </>
              </WarningBox>
              <h4>Base Rules and Limitations</h4>
              <ul className="list-inside list-disc">
                <li>
                  You must use <b>, (comma)</b> as a delimiter in your CSV file.
                </li>
                <li>
                  Only valid roles are <b>ADMIN</b>, <b>BASE</b> and{" "}
                  <b>SELF_SERVICE</b>. Role column is case-sensitive.
                </li>
                <li>
                  Each row represents a new user to be invited. Ensure the email
                  column is valid.
                </li>
                <li>
                  Invited users will receive an email with a link to join the
                  organization.
                </li>
              </ul>

              <h4 className="mt-2">Extra Considerations</h4>
              <ul className="mb-4 list-inside list-disc">
                <li>
                  The first row of the sheet will be ignored. Use it for column
                  headers as in the provided template.
                </li>
              </ul>

              <p className="mb-4">
                Once you've uploaded your file, a summary of the processed
                invitations will be displayed, along with any errors
                encountered.
              </p>

              <fetcher.Form
                action="/api/settings/import-users"
                method="POST"
                encType="multipart/form-data"
              >
                <Input
                  inputType="textarea"
                  label="Enter your message to user"
                  name="message"
                  className="mb-2"
                  disabled={disabled}
                  rows={5}
                />

                <Input
                  type="file"
                  name="file"
                  label="Select a csv file"
                  required
                  accept=".csv"
                  className="mb-2"
                  error={error}
                  onChange={handleSelectFile}
                  disabled={disabled}
                />

                <When truthy={!!fetcher?.data?.error}>
                  <p className="mb-2 text-sm  text-error-500">
                    {fetcher.data?.error?.message}
                  </p>
                </When>

                <Button disabled={!selectedFile || disabled}>Import now</Button>
              </fetcher.Form>
            </div>
          )}
        </Dialog>
      </DialogPortal>
    </>
  );
}
