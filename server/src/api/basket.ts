import type { FastifyInstance } from "fastify";
import type {
  AddBasketItemRequest,
  BasketItem,
  BulkAddBasketRequest,
  BulkAddBasketResponse,
  RequestBasketRequest,
} from "@resonarr/shared";
import {
  addManyToBasket,
  addToBasket,
  listBasket,
  refreshBasketStatuses,
  removeFromBasket,
  requestBasket,
} from "../basket/service.ts";

export function registerBasketRoutes(app: FastifyInstance): void {
  app.get("/api/basket", async (): Promise<BasketItem[]> => listBasket());

  app.post<{ Body: AddBasketItemRequest }>(
    "/api/basket",
    async (req, reply): Promise<BasketItem> => {
      try {
        return await addToBasket(req.body ?? ({} as AddBasketItemRequest));
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );

  app.post<{ Body: BulkAddBasketRequest }>(
    "/api/basket/bulk",
    async (req): Promise<BulkAddBasketResponse> => {
      return addManyToBasket(req.body?.items ?? []);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/basket/:id",
    async (req): Promise<{ ok: true }> => {
      removeFromBasket(req.params.id);
      return { ok: true };
    },
  );

  // Re-check requested items against Lidarr; flip downloaded ones to "done".
  app.post("/api/basket/refresh", async (): Promise<BasketItem[]> => {
    try {
      return await refreshBasketStatuses();
    } catch {
      return listBasket();
    }
  });

  app.post<{ Body: RequestBasketRequest }>(
    "/api/basket/request",
    async (req, reply): Promise<BasketItem[]> => {
      try {
        return await requestBasket(req.body?.ids);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
