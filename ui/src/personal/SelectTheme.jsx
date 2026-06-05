import { SelectInput, useDataProvider, useTranslate } from 'react-admin'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useEffect, useRef } from 'react'
import { AUTO_THEME_ID } from '../consts'
import themes from '../themes'
import { HelpMsg } from './HelpMsg'
import { docsUrl, openInNewTab } from '../utils'
import { changeTheme } from '../actions'

const helpKey = '_help'

export const SelectTheme = (props) => {
  const translate = useTranslate()
  const dispatch = useDispatch()
  const dataProvider = useDataProvider()
  const currentTheme = useSelector((state) => state.theme)
  const userRecordRef = useRef(null)

  const userId = localStorage.getItem('userId')

  useEffect(() => {
    if (!userId) return
    dataProvider.getOne('user', { id: userId }).then(({ data }) => {
      userRecordRef.current = data
    })
  }, [dataProvider, userId])

  const themeChoices = [
    {
      id: AUTO_THEME_ID,
      name: 'Auto',
    },
  ]
  themeChoices.push(
    ...Object.keys(themes).map((key) => {
      return { id: key, name: themes[key].themeName }
    }),
  )
  themeChoices.push({
    id: helpKey,
    name: <HelpMsg caption={'Create your own'} />,
  })

  const handleChange = useCallback(
    (event) => {
      const themeId = event.target.value
      if (themeId === helpKey) {
        openInNewTab(docsUrl('/docs/developers/creating-themes/'))
        return
      }
      dispatch(changeTheme(themeId))
      if (userId && userRecordRef.current) {
        dataProvider.update('user', {
          id: userId,
          data: { ...userRecordRef.current, theme: themeId },
          previousData: userRecordRef.current,
        })
      }
    },
    [dispatch, dataProvider, userId],
  )

  return (
    <SelectInput
      {...props}
      source="theme"
      label={translate('menu.personal.options.theme')}
      defaultValue={currentTheme}
      translateChoice={false}
      choices={themeChoices}
      onChange={handleChange}
    />
  )
}
