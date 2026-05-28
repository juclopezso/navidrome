import stylesheet from './neon.css.js'

// Hyperpop color palette
const background = '#16131D'
const surface = '#1a1a1a'
const foreground = '#A5F3FC'
const foregroundMuted = '#efe2fc'
const textMuted = '#efe2fc'

const primary = '#FF2BD6'
const primaryBright = '#FF3B77'
const secondary = '#62357c'

const border = '#FF2BD6'
const shadow = '#111'
const greenNeon = '#aeff00'
const purpleNeon = '#A855F7'
const pinkNeon = '#FF2BD6'
const cianNeon = '#00fff7'
const purpleDark = '#241B2F'
const lightBlue = '#A5F3FC'
const errorRed = '#FF5A7A'

export default {
  themeName: 'Neon',
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, Apple Color Emoji, SF Pro, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif',
    h6: {
      fontSize: '1rem',
    },
    h5: {
      fontSize: '2em',
      fontWeight: '600',
    },
  },

  palette: {
    primary: {
      main: primary,
    },

    secondary: {
      main: secondary,
      contrastText: foreground,
    },

    background: {
      default: background,
      paper: background,
    },

    type: 'dark',
  },

  overrides: {
    MuiFormGroup: {
      root: {
        color: foreground,
      },
    },

    MuiAppBar: {
      positionFixed: {
        backgroundColor: `${surface} !important`,
        boxShadow: 'none',
        borderBottom: `1px solid ${border}`,
      },

      colorSecondary: {
        color: foreground,
      },
    },

    MuiDrawer: {
      root: {
        background: surface,
        borderRight: `1px solid ${border}`,
      },
    },

    MuiToolbar: {
      root: {
        background: `${purpleDark} !important`,
      },
    },

    MuiCardMedia: {
      img: {
        borderRadius: '10px',
        boxShadow: `5px 5px 20px ${shadow}`,
      },
    },

    MuiButton: {
      root: {
        background: secondary,
        color: '#fff',
        borderRadius: '6px',
        paddingRight: '0.5rem',
        paddingLeft: '0.5rem',
        marginLeft: '0.5rem',
        marginBottom: '0.5rem',
        textTransform: 'capitalize',
        fontWeight: 600,
      },

      textPrimary: {
        color: foreground,
      },

      textSecondary: {
        color: foreground,
        backgroundColor: primary,
      },

      textSizeSmall: {
        fontSize: '0.8rem',
        paddingRight: '0.5rem',
        paddingLeft: '0.5rem',
      },

      label: {
        paddingRight: '1rem',
        paddingLeft: '0.7rem',
      },
    },

    MuiListItemIcon: {
      root: {
        color: primary,
      },
    },

    MuiChip: {
      root: {
        borderRadius: '6px',
      },
    },

    MuiIconButton: {
      root: {
        color: primary,
      },
    },

    MuiTableBody: {
      root: {
        '&>tr:nth-child(odd)': {
          background: 'rgba(255, 255, 255, 0.025)',
        },
      },
    },

    MuiTableRow: {
      root: {
        background: 'transparent',
      },
    },

    MuiTableCell: {
      root: {
        borderBottom: '0 none !important',
        padding: '10px !important',
        color: `${textMuted} !important`,
      },

      head: {
        color: `${textMuted} !important`,
      },
    },

    MuiMenuItem: {
      root: {
        fontSize: '0.875rem',
        borderRadius: '10px',
        color: foreground,
      },
    },

    MuiPaper: {
      elevation1: {
        boxShadow: 'none',
      },

      root: {
        color: foreground,
        backgroundColor: purpleDark,
      },

      rounded: {
        borderRadius: '6px',
      },
    },

    NDAlbumGridView: {
      albumName: {
        color: foreground,
      },

      albumPlayButton: {
        color: primary,
      },

      albumArtistName: {
        color: foregroundMuted,
      },

      cover: {
        borderRadius: '6px',
      },
    },

    NDLogin: {
      systemNameLink: {
        color: primary,
      },

      welcome: {
        color: foreground,
      },

      card: {
        minWidth: 300,
        backgroundColor: surface,
      },

      icon: {
        filter: 'hue-rotate(115deg)',
      },
    },

    NDMobileArtistDetails: {
      bgContainer: {
        background: background,
      },

      artistName: {
        fontWeight: '600',
        fontSize: '2em',
      },
    },

    NDDesktopArtistDetails: {
      artistName: {
        fontWeight: '600',
        fontSize: '2em',
      },

      artistDetail: {
        padding: 'unset',
        paddingBottom: '1rem',
      },
    },

    RaSidebar: {
      fixed: {
        backgroundColor: background,
      },

      drawerPaper: {
        backgroundColor: `${background} !important`,
      },
    },

    RaDeleteWithConfirmButton: {
      deleteButton: {
        color: '#fff !important',
      },
    },

    RaDeleteWithUndoButton: {
      deleteButton: {
        color: '#fff !important',
      },
    },

    RaBulkDeleteWithConfirmButton: {
      deleteButton: {
        color: '#fff !important',
      },
    },

    RaBulkDeleteWithUndoButton: {
      deleteButton: {
        color: '#fff !important',
      },
    },

    RaPaginationActions: {
      currentPageButton: {
        border: `2px solid ${secondary}`,
        background: 'transparent',
      },

      button: {
        border: `2px solid ${secondary}`,
      },

      actions: {
        '@global': {
          '.next-page': {
            border: '0 none',
          },

          '.previous-page': {
            border: '0 none',
          },
        },
      },
    },
    MuiTypography: {
      colorTextSecondary: {
        color: lightBlue,
      },
      error: {
        color: errorRed,
      }
    },
    MuiInputLabel: {
      error: {
        color: errorRed,
      }
    },
  },

  player: {
    theme: 'dark',
    stylesheet,
  },
}