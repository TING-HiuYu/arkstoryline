import { Input, Segmented, Select, Typography } from 'antd'
import {
  useAppSettingsStore,
  type AppThemeMode,
  type FontScale,
  type LineSpacing,
} from '../../infrastructure/storage/use-app-settings-store'

export function SettingsControls() {
  const themeMode = useAppSettingsStore((state) => state.themeMode)
  const setThemeMode = useAppSettingsStore((state) => state.setThemeMode)
  const fontScale = useAppSettingsStore((state) => state.fontScale)
  const setFontScale = useAppSettingsStore((state) => state.setFontScale)
  const lineSpacing = useAppSettingsStore((state) => state.lineSpacing)
  const setLineSpacing = useAppSettingsStore((state) => state.setLineSpacing)
  const doctorName = useAppSettingsStore((state) => state.doctorName)
  const setDoctorName = useAppSettingsStore((state) => state.setDoctorName)

  return (
    <>
      <div className="app-header__group app-header__group--theme">
        <Typography.Text>主题</Typography.Text>
        <Segmented<AppThemeMode>
          value={themeMode}
          onChange={(value) => setThemeMode(value)}
          options={[
            { label: '暗色', value: 'dark' },
            { label: '亮色', value: 'light' },
          ]}
        />
      </div>

      <div
        className="app-header__group app-header__group--reading"
        aria-label="reading-settings-controls"
      >
        <div className="settings-field">
          <Typography.Text>字号</Typography.Text>
          <Select<FontScale>
            style={{ width: 120 }}
            value={fontScale}
            onChange={(value) => setFontScale(value)}
            options={[
              { label: '小', value: 'small' },
              { label: '中', value: 'medium' },
              { label: '大', value: 'large' },
            ]}
          />
        </div>

        <div className="settings-field">
          <Typography.Text>行距</Typography.Text>
          <Select<LineSpacing>
            style={{ width: 120 }}
            value={lineSpacing}
            onChange={(value) => setLineSpacing(value)}
            options={[
              { label: '紧凑', value: 'compact' },
              { label: '舒适', value: 'comfortable' },
              { label: '宽松', value: 'relaxed' },
            ]}
          />
        </div>

        <div className="settings-field">
          <Typography.Text>博士</Typography.Text>
          <Input
            aria-label="博士名字设置"
            placeholder="{@nickname}"
            value={doctorName ?? ''}
            maxLength={24}
            onChange={(event) => setDoctorName(event.target.value)}
            style={{ width: 132 }}
          />
        </div>
      </div>
    </>
  )
}
