import { Currency, OrganizationType } from "@prisma/client";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import {
  json,
  redirect,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";

import { useLoaderData } from "@remix-run/react";
import { ExportBackupButton } from "~/components/assets/export-backup-button";
import { ErrorContent } from "~/components/errors";

import type { HeaderData } from "~/components/layout/header/types";

import {
  EditWorkspaceFormSchema,
  WorkspaceEditForm,
} from "~/components/workspace/edit-form";
import { db } from "~/database/db.server";
import { updateOrganization } from "~/modules/organization/service.server";
import { getOrganizationTierLimit } from "~/modules/tier/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { ShelfError, makeShelfError } from "~/utils/error";
import { data, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { canExportAssets } from "~/utils/subscription.server";
import { MAX_SIZE } from "./account-details.workspace.new";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, organizations } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });

    const user = await db.user
      .findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          firstName: true,

          userOrganizations: {
            include: {
              organization: {
                include: {
                  ssoDetails: true,
                  _count: {
                    select: {
                      assets: true,
                      members: true,
                      locations: true,
                    },
                  },
                  owner: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      profilePicture: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
      .catch((cause) => {
        throw new ShelfError({
          cause,
          message: "User not found",
          additionalData: { userId, organizationId },
          label: "Settings",
        });
      });

    const currentOrganization = user.userOrganizations.find(
      (userOrg) => userOrg.organizationId === organizationId
    );

    /* Check the tier limit */
    const tierLimit = await getOrganizationTierLimit({
      organizationId,
      organizations,
    });

    if (!currentOrganization) {
      throw new ShelfError({
        cause: null,
        message: "Organization not found",
        additionalData: { userId, organizationId },
        label: "Settings",
      });
    }

    const header: HeaderData = {
      title: "General",
    };

    return json(
      data({
        header,
        organization: currentOrganization.organization,
        canExportAssets: canExportAssets(tierLimit),
        user,
        curriences: Object.keys(Currency),
        isPersonalWorkspace:
          currentOrganization.organization.type === OrganizationType.PERSONAL,
      })
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw json(error(reason), { status: reason.status });
  }
}

export const handle = {
  breadcrumb: () => "General",
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const ErrorBoundary = () => <ErrorContent />;

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, currentOrganization } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });

    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();

    const { enabledSso } = currentOrganization;
    const schema = EditWorkspaceFormSchema(
      enabledSso,
      currentOrganization.type === "PERSONAL"
    );

    const payload = parseData(formData, schema, {
      additionalData: { userId, organizationId },
    });

    const {
      name,
      currency,
      id,
      selfServiceGroupId,
      adminGroupId,
      baseUserGroupId,
    } = payload;

    /** User is allowed to edit his/her current organization only not other organizations. */
    if (currentOrganization.id !== id) {
      throw new ShelfError({
        cause: null,
        message: "You are not allowed to edit this organization.",
        label: "Organization",
      });
    }

    const formDataFile = await unstable_parseMultipartFormData(
      request,
      unstable_createMemoryUploadHandler({ maxPartSize: MAX_SIZE })
    );

    const file = formDataFile.get("image") as File | null;

    await updateOrganization({
      id,
      name,
      image: file || null,
      userId: authSession.userId,
      currency,
      ...(enabledSso && {
        ssoDetails: {
          selfServiceGroupId: selfServiceGroupId as string,
          adminGroupId: adminGroupId as string,
          baseUserGroupId: baseUserGroupId as string,
        },
      }),
    });

    sendNotification({
      title: "Workspace updated",
      message: "Your workspace  has been updated successfully",
      icon: { name: "success", variant: "success" },
      senderId: authSession.userId,
    });

    return redirect("/settings/general");
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return json(error(reason), { status: reason.status });
  }
}

export default function GeneralPage() {
  const { organization, canExportAssets } = useLoaderData<typeof loader>();
  return (
    <div className="mb-2.5 flex flex-col justify-between bg-white md:rounded md:border md:border-gray-200 md:px-6 md:py-5">
      <div className="mb-6">
        <h3 className="text-text-lg font-semibold">General</h3>
        <p className="text-sm text-gray-600">
          Manage general workspace settings.
        </p>
      </div>

      <WorkspaceEditForm
        name={organization.name}
        currency={organization.currency}
        className="mt-0 border-0 p-0"
      />

      <div className=" mb-6">
        <h4 className="text-text-lg font-semibold">Asset backup</h4>
        <p className=" text-sm text-gray-600">
          Download a backup of your assets. If you want to restore a backup,
          please get in touch with support.
        </p>
        <p className=" font-italic mb-2 text-sm text-gray-600">
          IMPORTANT NOTE: QR codes will not be included in the export. Due to
          the nature of how Shelf's QR codes work, they currently cannot be
          exported with assets because they have unique ids. <br />
          Importing a backup will just create a new QR code for each asset.
        </p>
        <ExportBackupButton canExportAssets={canExportAssets} />
      </div>
    </div>
  );
}
