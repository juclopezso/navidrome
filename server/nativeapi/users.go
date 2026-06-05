package nativeapi

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/server"
)

func (api *Router) addUserAvatarRoutes(r chi.Router) {
	r.Route("/user/{id}/image", func(r chi.Router) {
		r.Use(server.URLParamsMiddleware)
		r.Get("/", api.getUserAvatar())
		r.Post("/", api.uploadUserAvatar())
		r.Delete("/", api.deleteUserAvatar())
	})
}

func (api *Router) getUserAvatar() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		userID := chi.URLParamFromCtx(ctx, "id")
		u, err := api.ds.User(ctx).Get(userID)
		if err != nil {
			if errors.Is(err, model.ErrNotFound) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if u.AvatarPath == "" {
			http.Error(w, "no avatar", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, u.AvatarImagePath())
	}
}

func (api *Router) uploadUserAvatar() http.HandlerFunc {
	return handleImageUpload(func(ctx context.Context, reader io.Reader, ext string) error {
		userID := chi.URLParamFromCtx(ctx, "id")
		if err := checkUserAvatarPermission(ctx, userID); err != nil {
			return err
		}
		u, err := api.ds.User(ctx).Get(userID)
		if err != nil {
			if errors.Is(err, model.ErrNotFound) {
				return model.ErrNotFound
			}
			return err
		}
		oldPath := u.AvatarImagePath()
		filename, err := api.imgUpload.SetImage(ctx, consts.EntityUser, u.ID, u.Name, oldPath, reader, ext)
		if err != nil {
			return err
		}
		u.AvatarPath = filename
		return api.ds.User(ctx).Put(u)
	})
}

func (api *Router) deleteUserAvatar() http.HandlerFunc {
	return handleImageDelete(func(ctx context.Context) error {
		userID := chi.URLParamFromCtx(ctx, "id")
		if err := checkUserAvatarPermission(ctx, userID); err != nil {
			return err
		}
		u, err := api.ds.User(ctx).Get(userID)
		if err != nil {
			if errors.Is(err, model.ErrNotFound) {
				return model.ErrNotFound
			}
			return err
		}
		if err := api.imgUpload.RemoveImage(ctx, u.AvatarImagePath()); err != nil {
			return err
		}
		u.AvatarPath = ""
		return api.ds.User(ctx).Put(u)
	})
}

// checkUserAvatarPermission returns ErrNotAuthorized if the authenticated user
// is neither the owner of the avatar nor an admin.
func checkUserAvatarPermission(ctx context.Context, targetUserID string) error {
	authUser, ok := request.UserFrom(ctx)
	if !ok {
		return model.ErrNotAuthorized
	}
	if authUser.ID != targetUserID && !authUser.IsAdmin {
		return model.ErrNotAuthorized
	}
	return nil
}
