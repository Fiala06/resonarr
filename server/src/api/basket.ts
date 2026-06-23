import type { FastifyInstance } from "fastify";
import type {
  AddBasketItemRequest,
  BasketItem,
  RequestBasketRequest,
} from "@resonarr/shared";
import {
  addToBasket,
  listBasket,
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

  app.delete<{ Params: { id: string } }>(
    "/api/basket/:id",
    async (req): Promise<{ ok: true }> => {
      removeFromBasket(req.params.id);
      return { ok: true };
    },
  );

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
