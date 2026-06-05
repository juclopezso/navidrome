import stylesheet from './lightBlue.css.js'

export default {
  themeName: 'Light Blue',
  palette: {
    type: 'light',
    primary: {
      light: '#42A5F5',
      main: '#1976D2',
      dark: '#1565C0',
      contrastText: '#ffffff',
    },
    secondary: {
      light: '#64B5F6',
      main: '#42A5F5',
      dark: '#1976D2',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F5F7FA',
      paper: '#ffffff',
    },
    text: {
      primary: '#1A1A2E',
      secondary: 'rgba(0, 0, 0, 0.6)',
    },
  },
  overrides: {
    MuiFilledInput: {
      root: {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        '&$disabled': {
          backgroundColor: 'rgba(0, 0, 0, 0.04)',
        },
      },
    },
    MuiButton: {
      textPrimary: {
        color: '#1976D2',
      },
    },
    MuiAppBar: {
      colorSecondary: {
        backgroundColor: '#1565C0',
        color: '#ffffff',
      },
    },
    NDLogin: {
      main: {
        '& .MuiFormLabel-root': {
          color: '#1A1A2E',
        },
        '& .MuiFormLabel-root.Mui-focused': {
          color: '#1976D2',
        },
        '& .MuiFormLabel-root.Mui-error': {
          color: '#f44336',
        },
        '& .MuiInput-underline:after': {
          borderBottom: '2px solid #1976D2',
        },
      },
      card: {
        minWidth: 300,
        marginTop: '6em',
        backgroundColor: '#fffffff0',
        border: '1px solid #BBDEFB',
      },
      avatar: {},
      icon: {},
      button: {
        backgroundColor: '#1976D2',
        boxShadow: '3px 3px 5px rgba(25, 118, 210, 0.4)',
        '&:hover': {
          backgroundColor: '#1565C0',
        },
      },
      systemNameLink: {
        color: '#1976D2',
      },
      welcome: {
        color: '#1A1A2E',
      },
    },
    RaMenuItemLink: {
      root: {
        '&[aria-current="page"]': {
          color: '#42a5f5',
          '& .MuiListItemIcon-root': {
            color: '#42a5f5',
          },
        },
      },
      active: {
        color: '#42a5f5',
        '& .MuiListItemIcon-root': {
          color: '#42a5f5',
        },
      },
    },
    MuiBadge: {
      badge: {
        backgroundColor: '#42a5f5 !important',
        color: '#ffffff !important',
      },
    },
    NDLoveButton: {
      love: {
        color: '#42a5f5 !important',
      },
    },
    MuiRating: {
      iconFilled: {
        color: '#42a5f5',
      },
    },
    MuiTableCell: {
      head: {
        backgroundColor: '#42a5f5 !important',
      },
    },
    NDMobileArtistDetails: {
      bgContainer: {
        background:
          'linear-gradient(to bottom, rgba(227, 242, 253, 0.72), rgb(245, 247, 250))!important',
      },
    },
  },
  player: {
    theme: 'light',
    stylesheet,
  },
}
