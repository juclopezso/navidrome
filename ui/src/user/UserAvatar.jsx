import React, { useCallback, useRef, useState } from 'react'
import { Avatar, IconButton, Tooltip } from '@material-ui/core'
import PhotoCameraIcon from '@material-ui/icons/PhotoCamera'
import DeleteIcon from '@material-ui/icons/Delete'
import { makeStyles } from '@material-ui/core/styles'
import { useNotify, useRecordContext } from 'react-admin'
import { httpClient } from '../dataProvider'
import { REST_URL } from '../consts'
import { getInitials } from '../utils/avatarUtils'
import { useAuthenticatedBlobUrl } from '../utils/useAuthenticatedBlobUrl'

const AVATAR_SIZE = 200

const useStyles = makeStyles((theme) => ({
  wrapper: {
    position: 'relative',
    display: 'inline-block',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginBottom: theme.spacing(2),
    '&:hover $controls': {
      opacity: 1,
    },
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    fontSize: '4rem',
    borderRadius: 8,
  },
  image: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    objectFit: 'cover',
    borderRadius: 8,
    display: 'block',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    display: 'flex',
    gap: '2px',
    padding: '2px',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: '6px 0 8px 0',
    opacity: 0,
    transition: 'opacity 0.2s ease-in-out',
  },
  controlBtn: {
    color: '#fff',
    padding: 4,
    '&:hover': {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
  },
  icon: {
    fontSize: '1.2rem',
  },
}))

const UserAvatar = () => {
  const record = useRecordContext() || {}
  const notify = useNotify()
  const classes = useStyles()
  const fileInputRef = useRef(null)

  // localAvatarPath: undefined = use record value, null = deleted, string = freshly uploaded
  const [localAvatarPath, setLocalAvatarPath] = useState(undefined)
  // version counter forces hook to re-fetch after upload
  const [avatarVersion, setAvatarVersion] = useState(0)

  const userId = record.id
  const isMyself = userId === localStorage.getItem('userId')
  const isAdmin = localStorage.getItem('role') === 'admin'
  const canEdit = isMyself || isAdmin

  const currentAvatarPath =
    localAvatarPath === undefined ? record.avatarPath : localAvatarPath

  const fetchUrl = currentAvatarPath
    ? `${REST_URL}/user/${userId}/image?v=${avatarVersion}`
    : null

  const blobUrl = useAuthenticatedBlobUrl(fetchUrl)

  const handleUploadClick = useCallback((e) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files[0]
      if (!file || !userId) return

      const allowed = ['image/jpeg', 'image/png']
      if (!allowed.includes(file.type)) {
        notify('message.coverUploadError', { type: 'warning' })
        return
      }

      const formData = new FormData()
      formData.append('image', file)

      try {
        await httpClient(`${REST_URL}/user/${userId}/image`, {
          method: 'POST',
          headers: new Headers({}),
          body: formData,
        })
        const newUrl = `${REST_URL}/user/${userId}/image?v=${Date.now()}`
        setLocalAvatarPath(file.name)
        setAvatarVersion((v) => v + 1)
        localStorage.setItem('avatar', newUrl)
        window.dispatchEvent(new CustomEvent('nd:avatarChanged', { detail: { url: newUrl } }))
        notify('message.coverUploaded', { type: 'success' })
      } catch {
        notify('message.coverUploadError', { type: 'warning' })
      }
      e.target.value = ''
    },
    [userId, notify],
  )

  const handleDelete = useCallback(
    async (e) => {
      e.stopPropagation()
      if (!userId) return
      try {
        await httpClient(`${REST_URL}/user/${userId}/image`, {
          method: 'DELETE',
        })
        setLocalAvatarPath(null)
        localStorage.setItem('avatar', '')
        window.dispatchEvent(new CustomEvent('nd:avatarChanged', { detail: { url: '' } }))
        notify('message.coverRemoved', { type: 'success' })
      } catch {
        notify('message.coverRemoveError', { type: 'warning' })
      }
    },
    [userId, notify],
  )

  return (
    <div className={classes.wrapper}>
      {blobUrl ? (
        <img
          src={blobUrl}
          alt={record.name || record.userName}
          className={classes.image}
        />
      ) : (
        <Avatar className={classes.avatar} variant="square">
          {getInitials(record.name || record.userName)}
        </Avatar>
      )}

      {canEdit && (
        <div className={classes.controls}>
          <Tooltip title="Subir foto de perfil">
            <IconButton
              className={classes.controlBtn}
              onClick={handleUploadClick}
              size="small"
            >
              <PhotoCameraIcon className={classes.icon} />
            </IconButton>
          </Tooltip>
          {currentAvatarPath && (
            <Tooltip title="Eliminar foto de perfil">
              <IconButton
                className={classes.controlBtn}
                onClick={handleDelete}
                size="small"
              >
                <DeleteIcon className={classes.icon} />
              </IconButton>
            </Tooltip>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  )
}

export default UserAvatar
