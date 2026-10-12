import Link from "next/link";
import type { AdminTableData } from "@website-audit/database";

function renderValue(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number")
    return new Intl.NumberFormat("en-IN").format(value);
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp) && value.endsWith("Z")) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(timestamp));
  }
  return value;
}

export function AdminTable({
  data,
  basePath,
}: {
  data: AdminTableData;
  basePath: string;
}) {
  return (
    <section className="admin-table-card">
      <header>
        <div>
          <p className="page-eyebrow">System records</p>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
        <span>
          {data.rows.length} shown
          {data.pagination ? ` · Page ${data.pagination.page}` : ""}
        </span>
      </header>
      {data.rows.length === 0 ? (
        <div className="admin-empty-state">
          <strong>No records to show</strong>
          <p>{data.emptyMessage}</p>
        </div>
      ) : (
        <div
          className="admin-table-scroll"
          role="region"
          aria-label={`${data.title} table`}
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">{data.title}</caption>
            <thead>
              <tr>
                {data.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  {row.values.map((value, index) => (
                    <td key={`${row.id}-${data.columns[index]}`}>
                      {renderValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pagination &&
      (data.pagination.page > 1 || data.pagination.hasNext) ? (
        <nav
          className="admin-table-pagination"
          aria-label={`${data.title} pages`}
        >
          {data.pagination.page > 1 ? (
            <Link href={`${basePath}?page=${data.pagination.page - 1}`}>
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
          <span>Page {data.pagination.page}</span>
          {data.pagination.hasNext ? (
            <Link href={`${basePath}?page=${data.pagination.page + 1}`}>
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
