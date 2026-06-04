import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

type TelegramMessage = {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  contact?: {
    phone_number: string;
    first_name?: string;
    last_name?: string;
    user_id?: number;
  };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function sendMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Telegram sendMessage error:', errorText);
  }
}

function keyboard(buttons: string[][]) {
  return {
    keyboard: buttons.map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function contactKeyboard() {
  return {
    keyboard: [
      [{ text: '📱 Отправить номер', request_contact: true }],
      [{ text: 'Пропустить' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function removeKeyboard() {
  return {
    remove_keyboard: true,
  };
}

async function getSession(telegramId: number) {
  const { data, error } = await supabaseAdmin
    .from('bro_bot_sessions')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) {
    console.error('getSession error:', error);
  }

  return data;
}

async function updateSession(telegramId: number, updates: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from('bro_bot_sessions')
    .upsert(
      {
        telegram_id: telegramId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'telegram_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('updateSession error:', error);
  }

  return data;
}

async function resetSession(telegramId: number) {
  const { error } = await supabaseAdmin
    .from('bro_bot_sessions')
    .delete()
    .eq('telegram_id', telegramId);

  if (error) {
    console.error('resetSession error:', error);
  }
}

function normalizeNumber(text?: string) {
  if (!text) return null;

  const value = Number(
    text
      .replace(',', '.')
      .replace(/[^\d.]/g, '')
  );

  return Number.isFinite(value) ? value : null;
}

function getStickRecommendation(params: {
  height_cm?: number;
  weight_kg?: number;
  play_style?: string;
}) {
  const height = params.height_cm || 0;
  const weight = params.weight_kg || 0;
  const style = params.play_style || '';

  let size = 'SR';
  let length = '66”';
  let flex = '75 flex';

  if (height < 140) {
    size = 'Junior';
    length = '54”';
  } else if (height >= 140 && height < 150) {
    size = 'INT';
    length = '58”';
  } else if (height >= 150 && height < 160) {
    size = 'INT';
    length = '61”';
  } else if (height >= 160 && height < 170) {
    size = 'INT';
    length = '63”';
  } else if (height >= 170 && height < 175) {
    size = 'SR';
    length = '65”';
  } else if (height >= 175 && height < 180) {
    size = 'SR';
    length = '66”';
  } else if (height >= 180 && height < 185) {
    size = 'SR';
    length = '67”';
  } else if (height >= 185 && height < 195) {
    size = 'SR';
    length = '69”';
  } else if (height >= 195) {
    size = 'SR';
    length = '71”';
  }

  if (size === 'Junior') {
    if (weight <= 35) flex = '30 flex';
    else if (weight <= 45) flex = '40 flex';
    else flex = '50 flex';
  } else if (size === 'INT') {
    if (weight <= 55) flex = '55 flex';
    else if (weight <= 70) flex = '65 flex';
    else flex = '70 flex';
  } else {
    if (weight <= 70) flex = '65 flex';
    else if (weight <= 85) flex = '75 flex';
    else if (weight <= 100) flex = '85 flex';
    else flex = '95 flex';
  }

  let curve = 'B90TM';
  let kick = 'Mid Kick';
  let model = 'BRO RETRO VECTOR';

  if (style === 'Снайпер') {
    curve = 'B28';
    kick = 'Low Kick';
    model = 'BRO RETRO ENERGY';
  }

  if (style === 'Универсал') {
    curve = 'B90TM';
    kick = 'Mid Kick';
    model = 'BRO RETRO VECTOR';
  }

  if (style === 'Плеймейкер') {
    curve = 'B92';
    kick = 'Mid Kick';
    model = 'BRO RETRO VECTOR';
  }

  if (style === 'Оборонительный защитник') {
    curve = 'B92MAX';
    kick = 'Mid Kick';
    model = 'BRO RETRO 0420';
  }

  if (style === 'Атакующий защитник') {
    curve = 'B90TM';
    kick = 'Mid Kick';
    model = 'BRO RETRO VECTOR';
  }

  let estimatedPrice = 23990;

  if (size === 'Junior') estimatedPrice = 18990;
  if (size === 'INT' || size === 'SR') estimatedPrice = 23990;

  return {
    size,
    length,
    flex,
    curve,
    kick,
    model,
    estimatedPrice,
  };
}

async function createLeadFromSession(session: any, message: TelegramMessage) {
  const recommendation = getStickRecommendation({
    height_cm: session?.height_cm,
    weight_kg: session?.weight_kg,
    play_style: session?.play_style,
  });

  const { data, error } = await supabaseAdmin
    .from('bro_leads')
    .insert({
      telegram_id: message.from.id,
      username: message.from.username || null,
      first_name: message.from.first_name || null,
      last_name: message.from.last_name || null,

      source: 'telegram_bot',
      scenario: session?.scenario || 'unknown',

      name: session?.name || message.from.first_name || null,
      phone: session?.phone || null,

      height_cm: session?.height_cm || null,
      weight_kg: session?.weight_kg || null,
      hand: session?.hand || null,
      player_level: session?.player_level || null,
      play_style: session?.play_style || null,
      stick_type: session?.stick_type || null,

      recommended_size: recommendation.size,
      recommended_length: recommendation.length,
      recommended_flex: recommendation.flex,
      recommended_curve: recommendation.curve,
      recommended_kick: recommendation.kick,
      recommended_model: recommendation.model,
      estimated_price: recommendation.estimatedPrice,

      status: 'new',
      next_action: 'Связаться с клиентом',
      comment: session?.comment || null,
    })
    .select()
    .single();

  if (error) {
    console.error('createLeadFromSession error:', error);
    return null;
  }

  if (ADMIN_CHAT_ID) {
    const username = message.from.username ? `@${message.from.username}` : 'не указан';

    await sendMessage(
      ADMIN_CHAT_ID,
      [
        '🔥 <b>Новый лид BRO</b>',
        '',
        `<b>Сценарий:</b> ${session?.scenario || 'не указан'}`,
        `<b>Имя:</b> ${session?.name || message.from.first_name || 'не указано'}`,
        `<b>Телефон:</b> ${session?.phone || 'не указан'}`,
        `<b>Telegram:</b> ${username}`,
        '',
        `<b>Рост:</b> ${session?.height_cm || '-'} см`,
        `<b>Вес:</b> ${session?.weight_kg || '-'} кг`,
        `<b>Хват:</b> ${session?.hand || '-'}`,
        `<b>Уровень:</b> ${session?.player_level || '-'}`,
        `<b>Стиль:</b> ${session?.play_style || '-'}`,
        '',
        '<b>Рекомендация:</b>',
        `${recommendation.size}, ${recommendation.length}, ${recommendation.flex}`,
        `${recommendation.curve}, ${recommendation.kick}`,
        `Модель: ${recommendation.model}`,
        `Цена от: ${recommendation.estimatedPrice.toLocaleString('ru-RU')} ₽`,
      ].join('\n')
    );
  }

  return {
    lead: data,
    recommendation,
  };
}

async function handleStart(message: TelegramMessage) {
  await resetSession(message.from.id);

  await updateSession(message.from.id, {
    step: 'main_menu',
    scenario: null,
  });

  await sendMessage(
    message.chat.id,
    [
      'Привет! Это BRO 🏒',
      '',
      'Я помогу подобрать клюшку, рассчитать кастом или передать заявку.',
      '',
      'Что хотите сделать?',
    ].join('\n'),
    keyboard([
      ['🏒 Подобрать клюшку'],
      ['🧩 Кастомная клюшка'],
      ['📦 Узнать наличие'],
      ['👥 Командный / оптовый заказ'],
      ['☎️ Связаться с менеджером'],
    ])
  );
}

async function handleMainMenu(message: TelegramMessage, text: string) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  if (normalizedText === '🏒 Подобрать клюшку') {
    await updateSession(message.from.id, {
      step: 'height',
      scenario: 'stick_selection',
    });

    await sendMessage(
      message.chat.id,
      'Отлично. Начнём подбор клюшки.\n\nУкажите ваш рост в сантиметрах, например: 180',
      removeKeyboard()
    );

    return;
  }

  if (normalizedText === '🧩 Кастомная клюшка') {
    await updateSession(message.from.id, {
      step: 'height',
      scenario: 'custom_stick',
      stick_type: 'custom',
    });

    await sendMessage(
      message.chat.id,
      [
        'Кастомная клюшка BRO собирается под ваши параметры: длина, flex, загиб, вес, дизайн и надпись.',
        '',
        'Для начала укажите ваш рост в сантиметрах, например: 180',
      ].join('\n'),
      removeKeyboard()
    );

    return;
  }

  if (normalizedText === '📦 Узнать наличие') {
    await updateSession(message.from.id, {
      step: 'inventory_interest',
      scenario: 'inventory',
    });

    await sendMessage(
      message.chat.id,
      'Какая клюшка интересует?',
      keyboard([
        ['Детская'],
        ['Подростковая'],
        ['Взрослая'],
        ['Кастомная'],
        ['Назад'],
      ])
    );

    return;
  }

  if (normalizedText === '👥 Командный / оптовый заказ') {
    await updateSession(message.from.id, {
      step: 'team_order_name',
      scenario: 'team_order',
    });

    await sendMessage(
      message.chat.id,
      'Напишите название команды/клуба и примерное количество клюшек.',
      removeKeyboard()
    );

    return;
  }

  if (normalizedText === '☎️ Связаться с менеджером') {
    await updateSession(message.from.id, {
      step: 'phone',
      scenario: 'manager_contact',
    });

    await sendMessage(
      message.chat.id,
      'Оставьте номер телефона, и мы свяжемся с вами.',
      contactKeyboard()
    );

    return;
  }

  await sendMessage(
    message.chat.id,
    'Выберите действие из меню.',
    keyboard([
      ['🏒 Подобрать клюшку'],
      ['🧩 Кастомная клюшка'],
      ['📦 Узнать наличие'],
      ['👥 Командный / оптовый заказ'],
      ['☎️ Связаться с менеджером'],
    ])
  );
}

async function handleDialog(message: TelegramMessage) {
  const text = message.text?.trim();
  const normalizedText = text
    ?.replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const session = await getSession(message.from.id);

  if (text === 'Назад' || text === '/start') {
    await handleStart(message);
    return;
  }

  if (normalizedText?.includes('подобрать')) {
    await updateSession(message.from.id, {
      step: 'height',
      scenario: 'stick_selection',
    });

    await sendMessage(
      message.chat.id,
      'Отлично. Начнём подбор клюшки.\n\nУкажите ваш рост в сантиметрах, например: 180',
      removeKeyboard()
    );

    return;
  }

  if (normalizedText?.includes('кастом')) {
    await updateSession(message.from.id, {
      step: 'height',
      scenario: 'custom_stick',
      stick_type: 'custom',
    });

    await sendMessage(
      message.chat.id,
      [
        'Кастомная клюшка BRO собирается под ваши параметры: длина, flex, загиб, вес, дизайн и надпись.',
        '',
        'Для начала укажите ваш рост в сантиметрах, например: 180',
      ].join('\n'),
      removeKeyboard()
    );

    return;
  }

  if (normalizedText?.includes('наличие')) {
    await updateSession(message.from.id, {
      step: 'inventory_interest',
      scenario: 'inventory',
    });

    await sendMessage(
      message.chat.id,
      'Какая клюшка интересует?',
      keyboard([
        ['Детская'],
        ['Подростковая'],
        ['Взрослая'],
        ['Кастомная'],
        ['Назад'],
      ])
    );

    return;
  }

  if (normalizedText?.includes('командный') || normalizedText?.includes('оптовый')) {
    await updateSession(message.from.id, {
      step: 'team_order_name',
      scenario: 'team_order',
    });

    await sendMessage(
      message.chat.id,
      'Напишите название команды/клуба и примерное количество клюшек.',
      removeKeyboard()
    );

    return;
  }

  if (normalizedText?.includes('связаться') || normalizedText?.includes('менеджер')) {
    await updateSession(message.from.id, {
      step: 'phone',
      scenario: 'manager_contact',
    });

    await sendMessage(
      message.chat.id,
      'Оставьте номер телефона, и мы свяжемся с вами.',
      contactKeyboard()
    );

    return;
  }

  if (!session) {
    await handleStart(message);
    return;
  }

  if (message.contact?.phone_number) {
    await updateSession(message.from.id, {
      phone: message.contact.phone_number,
    });

    const updatedSession = await getSession(message.from.id);
    const result = await createLeadFromSession(updatedSession, message);

    await sendMessage(
      message.chat.id,
      [
        'Спасибо! Заявка получена.',
        '',
        result?.recommendation
          ? [
              'По вашим параметрам предварительно подходит:',
              '',
              `Размер: ${result.recommendation.size}`,
              `Длина: ${result.recommendation.length}`,
              `Flex: ${result.recommendation.flex}`,
              `Загиб: ${result.recommendation.curve}`,
              `Kick point: ${result.recommendation.kick}`,
              `Модель: ${result.recommendation.model}`,
              '',
              `Цена: от ${result.recommendation.estimatedPrice.toLocaleString('ru-RU')} ₽`,
            ].join('\n')
          : 'Мы передали заявку менеджеру.',
        '',
        'Мы можем предложить готовую модель из наличия или собрать кастомную клюшку под вас.',
      ].join('\n'),
      keyboard([
        ['🏒 Подобрать клюшку'],
        ['🧩 Кастомная клюшка'],
        ['📦 Узнать наличие'],
      ])
    );

    await resetSession(message.from.id);
    return;
  }

  if (!text) {
    await sendMessage(message.chat.id, 'Напишите ответ текстом или выберите кнопку.');
    return;
  }

  switch (session.step) {
    case 'main_menu':
      await handleMainMenu(message, text);
      return;

    case 'height': {
      const height = normalizeNumber(text);

      if (!height || height < 80 || height > 230) {
        await sendMessage(message.chat.id, 'Укажите рост числом в сантиметрах, например: 180');
        return;
      }

      await updateSession(message.from.id, {
        height_cm: height,
        step: 'weight',
      });

      await sendMessage(message.chat.id, 'Теперь укажите вес в кг, например: 78');
      return;
    }

    case 'weight': {
      const weight = normalizeNumber(text);

      if (!weight || weight < 20 || weight > 150) {
        await sendMessage(message.chat.id, 'Укажите вес числом в кг, например: 78');
        return;
      }

      await updateSession(message.from.id, {
        weight_kg: weight,
        step: 'hand',
      });

      await sendMessage(
        message.chat.id,
        'Какой у вас хват?',
        keyboard([['Левый'], ['Правый']])
      );
      return;
    }

    case 'hand': {
      if (!['Левый', 'Правый'].includes(text)) {
        await sendMessage(message.chat.id, 'Выберите хват: левый или правый.');
        return;
      }

      await updateSession(message.from.id, {
        hand: text,
        step: 'player_level',
      });

      await sendMessage(
        message.chat.id,
        'Ваш уровень игры?',
        keyboard([
          ['Любитель'],
          ['Детская академия'],
          ['Полупрофи'],
          ['Профи'],
        ])
      );
      return;
    }

    case 'player_level': {
      await updateSession(message.from.id, {
        player_level: text,
        step: 'play_style',
      });

      await sendMessage(
        message.chat.id,
        'Какой стиль игры ближе?',
        keyboard([
          ['Снайпер'],
          ['Универсал'],
          ['Плеймейкер'],
          ['Оборонительный защитник'],
          ['Атакующий защитник'],
        ])
      );
      return;
    }

    case 'play_style': {
      const styles = [
        'Снайпер',
        'Универсал',
        'Плеймейкер',
        'Оборонительный защитник',
        'Атакующий защитник',
      ];

      if (!styles.includes(text)) {
        await sendMessage(message.chat.id, 'Выберите стиль игры из списка.');
        return;
      }

      await updateSession(message.from.id, {
        play_style: text,
        step: 'phone',
      });

      const updatedSession = await getSession(message.from.id);
      const recommendation = getStickRecommendation({
        height_cm: updatedSession?.height_cm,
        weight_kg: updatedSession?.weight_kg,
        play_style: text,
      });

      await sendMessage(
        message.chat.id,
        [
          'Предварительная рекомендация BRO:',
          '',
          `Размер: ${recommendation.size}`,
          `Длина: ${recommendation.length}`,
          `Flex: ${recommendation.flex}`,
          `Загиб: ${recommendation.curve}`,
          `Kick point: ${recommendation.kick}`,
          `Модель: ${recommendation.model}`,
          '',
          `Цена: от ${recommendation.estimatedPrice.toLocaleString('ru-RU')} ₽`,
          '',
          'Оставьте номер телефона, чтобы мы сохранили подбор и помогли выбрать готовую модель или кастом.',
        ].join('\n'),
        contactKeyboard()
      );
      return;
    }

    case 'phone': {
      if (text === 'Пропустить') {
        const result = await createLeadFromSession(session, message);

        await sendMessage(
          message.chat.id,
          [
            'Готово! Мы сохранили ваш подбор.',
            '',
            result?.recommendation
              ? `Рекомендация: ${result.recommendation.size}, ${result.recommendation.length}, ${result.recommendation.flex}, ${result.recommendation.curve}.`
              : '',
            '',
            'Для быстрого ответа можете написать менеджеру BRO: +7 993 928-33-28',
          ].join('\n'),
          keyboard([
            ['🏒 Подобрать клюшку'],
            ['🧩 Кастомная клюшка'],
            ['📦 Узнать наличие'],
          ])
        );

        await resetSession(message.from.id);
        return;
      }

      await updateSession(message.from.id, {
        phone: text,
      });

      const updatedSession = await getSession(message.from.id);
      const result = await createLeadFromSession(updatedSession, message);

      await sendMessage(
        message.chat.id,
        [
          'Спасибо! Заявка получена.',
          '',
          result?.recommendation
            ? [
                'По вашим параметрам предварительно подходит:',
                '',
                `Размер: ${result.recommendation.size}`,
                `Длина: ${result.recommendation.length}`,
                `Flex: ${result.recommendation.flex}`,
                `Загиб: ${result.recommendation.curve}`,
                `Kick point: ${result.recommendation.kick}`,
                `Модель: ${result.recommendation.model}`,
                '',
                `Цена: от ${result.recommendation.estimatedPrice.toLocaleString('ru-RU')} ₽`,
              ].join('\n')
            : 'Мы передали заявку менеджеру.',
          '',
          'Мы можем предложить готовую модель из наличия или собрать кастомную клюшку под вас.',
        ].join('\n'),
        keyboard([
          ['🏒 Подобрать клюшку'],
          ['🧩 Кастомная клюшка'],
          ['📦 Узнать наличие'],
        ])
      );

      await resetSession(message.from.id);
      return;
    }

    case 'inventory_interest': {
      await updateSession(message.from.id, {
        stick_type: text,
        step: 'phone',
      });

      await sendMessage(
        message.chat.id,
        [
          `Приняли запрос: ${text}.`,
          '',
          'Оставьте номер телефона или Telegram, и мы отправим актуальные варианты из наличия.',
        ].join('\n'),
        contactKeyboard()
      );
      return;
    }

    case 'team_order_name': {
      await updateSession(message.from.id, {
        comment: text,
        step: 'phone',
      });

      await sendMessage(
        message.chat.id,
        [
          'Отлично, командный заказ зафиксировали.',
          '',
          'Оставьте номер телефона, чтобы мы связались и подготовили предложение.',
        ].join('\n'),
        contactKeyboard()
      );
      return;
    }

    default:
      await handleStart(message);
      return;
  }
}

export async function POST(req: Request) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const text = message.text?.trim();

    if (text === '/start') {
      await handleStart(message);
      return NextResponse.json({ ok: true });
    }

    await handleDialog(message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('BRO bot error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'BRO Telegram Bot',
  });
}
